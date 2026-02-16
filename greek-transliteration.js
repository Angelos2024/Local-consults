(function () {
  const greekLetterRE = /[\u0370-\u03FF\u1F00-\u1FFF]/u;
  const greekWordRE = /[\u0370-\u03FF\u1F00-\u1FFF]+/gu;
  const vowelSet = new Set(['α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω']);
  const roughBreathing = '\u0314';
  const accentMarks = new Set(['\u0300', '\u0301', '\u0342']);
  const acuteMap = {
    a: 'á',
    e: 'é',
    i: 'í',
    o: 'ó',
    u: 'ú',
    y: 'ý'
  };

  const letterMap = {
    α: 'a',
    β: 'b',
    γ: 'g',
    δ: 'd',
    ε: 'e',
    ζ: 'z',
    η: 'e',
    θ: 'th',
    ι: 'i',
    κ: 'k',
    λ: 'l',
    μ: 'm',
    ν: 'n',
    ξ: 'x',
    ο: 'o',
    π: 'p',
    ρ: 'r',
    σ: 's',
    ς: 's',
    τ: 't',
    υ: 'y',
    φ: 'ph',
    χ: 'j',
    ψ: 'ps',
    ω: 'o'
  };

  const diphthongs = {
    αι: 'ai',
    ει: 'ei',
    οι: 'oi',
    ου: 'u',
    αυ: 'au',
    ευ: 'eu',
    υι: 'ui'
  };

const applyAccentIfNeeded = (segment, marks) => {
    if (!segment || !marks) return segment;
    const shouldAccent = [...marks].some((mark) => accentMarks.has(mark));
    if (!shouldAccent) return segment;

    for (let i = segment.length - 1; i >= 0; i -= 1) {
      const ch = segment[i];
      if (!acuteMap[ch]) continue;
      return `${segment.slice(0, i)}${acuteMap[ch]}${segment.slice(i + 1)}`;
    }

    return segment;
  };
  const splitClusters = (src) => {
    const normalized = src.normalize('NFD').toLowerCase();
    const clusters = [];
    for (let i = 0; i < normalized.length; i += 1) {
      const ch = normalized[i];
      if (!greekLetterRE.test(ch)) {
        clusters.push({ base: ch, marks: '' });
        continue;
      }
      let marks = '';
      while (i + 1 < normalized.length) {
        const next = normalized[i + 1];
        if (/\p{M}/u.test(next)) {
          marks += next;
          i += 1;
          continue;
        }
        break;
      }
      clusters.push({ base: ch, marks });
    }
    return clusters;
  };

  const transliterateGreekWord = (word) => {
    const clusters = splitClusters(word);
    let out = '';

    for (let i = 0; i < clusters.length; i += 1) {
      const current = clusters[i];
      const next = clusters[i + 1];
      const pair = `${current.base}${next?.base ?? ''}`;

      if (!greekLetterRE.test(current.base)) {
        out += current.base;
        continue;
      }

      if (i === 0 && current.base === 'ρ' && current.marks.includes(roughBreathing)) {
        out += 'rh';
        continue;
      }

      if (i === 0 && vowelSet.has(current.base) && current.marks.includes(roughBreathing)) {
        out += 'h';
      }

      if (diphthongs[pair]) {
         let diphthongOut = pair === 'υι' && next?.marks.includes(roughBreathing) ? 'hui' : diphthongs[pair];

        if (current.marks || next?.marks) {
          diphthongOut = applyAccentIfNeeded(diphthongOut, `${current.marks}${next?.marks ?? ''}`);
        }
        out += diphthongOut;
        i += 1;
        continue;
      }

      if (current.base === 'γ' && next && ['γ', 'κ', 'ξ', 'χ'].includes(next.base)) {
        out += 'n';
        continue;
      }

      const mapped = letterMap[current.base] ?? current.base;
      out += applyAccentIfNeeded(mapped, current.marks);
    }

    return out.normalize('NFC');
  };

  const transliterateGreek = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text.replace(greekWordRE, (word) => transliterateGreekWord(word));
  };

  const hasGreek = (text) => typeof text === 'string' && /[\u0370-\u03FF\u1F00-\u1FFF]/u.test(text);

  window.GreekTransliteration = {
    transliterateGreek,
    hasGreek
  };
})();
