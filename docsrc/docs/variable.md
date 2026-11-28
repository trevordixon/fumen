# Variable

Variables are specified by the form of "%VariableName=Value".

| Variable Name        | Value Type          | Description  |
| ------------- |:-------------:| -----|
| TITLE     | String      | Title of the song. | 
| SUB_TITLE     | String      | Sub title of the song. | 
| ARTIST     | String      | Artist name. | 
| KEY        | String      | Key of the song. e.g. C, Gm |
| TRANSPOSE | String\|Integer | Transposed key (String) or transpose interval by integer in semitone unit. See [Transose](transpose.md) for details. |
| KEY_TYPE  | String | Preffered key type(flat/b or sharp/#) for transposing. See [Transpose](transpose.md) for details. |
| SHOW_STAFF | String | "NO" (default) : no staff; a bar's written rhythm is drawn in the bar, with its chord names above. "YES" : a staff on every row. "AUTO" : a staff on each row that has written rhythm. ("SLASHES", the old way to write "YES" with SHOW_SLASHES, is still read.) |
| SHOW_SLASHES | String | "YES" : a slash on each beat of a bar without written rhythm, with or without a staff. "NO" (default) : none. |
| SHOW_FOOTER | String | "YES" : Show footer(default), "NO": Not to show footer.