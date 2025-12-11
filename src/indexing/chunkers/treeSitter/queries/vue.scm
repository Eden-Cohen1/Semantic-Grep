; Vue.js Query Patterns for extracting semantic code units
; Note: tree-sitter-vue parses template structure, not script content
; Script content extraction will be handled separately with TS/JS parsers

; Script element (will extract content separately)
(script_element) @script

; Template element
(template_element) @template

; Style element
(style_element) @style
