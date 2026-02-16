(function () {
  const greekLetterRE = /[\u0370-\u03FF\u1F00-\u1FFF]/u;
  const greekWordRE = /[\u0370-\u03FF\u1F00-\u1FFF]+/gu;
  const vowelSet = new Set(['α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω']);
  const roughBreathing = '\u0314';

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
    χ: 'ch',
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
        if (pair === 'υι' && next?.marks.includes(roughBreathing)) {
          out += 'hui';
        } else {
          out += diphthongs[pair];
        }
        i += 1;
        continue;
      }

      if (current.base === 'γ' && next && ['γ', 'κ', 'ξ', 'χ'].includes(next.base)) {
        out += 'n';
        continue;
      }

      out += letterMap[current.base] ?? current.base;
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
