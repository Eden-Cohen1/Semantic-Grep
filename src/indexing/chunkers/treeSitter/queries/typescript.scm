; TypeScript Query Patterns for extracting semantic code units

; Function declarations
(function_declaration
  name: (identifier) @name) @function

; Async function declarations
(function_declaration
  (async) @async
  name: (identifier) @name) @function

; Arrow functions assigned to variables
(lexical_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function)]) @value) @function

; Exported arrow functions
(export_statement
  (lexical_declaration
    (variable_declarator
      name: (identifier) @name
      value: [(arrow_function) (function)]) @value)) @function

; Method definitions in classes
(method_definition
  name: (property_identifier) @name) @method

; Class declarations
(class_declaration
  name: (type_identifier) @name) @class

; Exported classes
(export_statement
  (class_declaration
    name: (type_identifier) @name)) @class

; Interface declarations
(interface_declaration
  name: (type_identifier) @name) @interface

; Type alias declarations
(type_alias_declaration
  name: (type_identifier) @name) @type

; Const declarations (for exported constants)
(export_statement
  (lexical_declaration
    (variable_declarator
      name: (identifier) @name))) @const

; Enum declarations
(enum_declaration
  name: (identifier) @name) @type
