# Investigación: אֶשְׁכֹּל (Eshkol)

## Resultado práctico

Para el caso **אֶשְׁכֹּל**, la salida esperada para transliteración simplificada es **eshkól** (no *eshekól*), porque el **shevá** bajo la **שׁ** se trata como **shevá naḥ** (mudo) en este patrón.

## Regla aplicada en esta herramienta

Se agregó una heurística específica para silenciar shevá cuando:

1. el shevá está en posición interna (no inicial),
2. la letra anterior tiene vocal corta,
3. la letra siguiente lleva vocal plena.

Con esa combinación, la secuencia se resuelve como cierre silábico del tipo *esh-kol*.

## Nota lingüística

En hebreo bíblico los valores de shevá dependen de contexto fonológico y tradición de lectura; por eso esta regla es **heurística** y no absoluta para todos los lemas.

## Estado de verificación externa

Se intentó consultar fuentes en línea (incluyendo Archive.org), pero el entorno devolvió **HTTP 403 (CONNECT tunnel failed)**, por lo que no fue posible validar nuevas referencias web desde esta sesión.
