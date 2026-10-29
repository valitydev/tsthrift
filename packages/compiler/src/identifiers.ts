/** ECMAScript reserved words that cannot be used as generated identifiers. */
export const reservedWords: ReadonlySet<string> = new Set(
  "await break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public".split(
    " ",
  ),
);
