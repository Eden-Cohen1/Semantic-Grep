; JavaScript Query Patterns for extracting semantic code units

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

; Variable declarations with arrow functions
(variable_declaration
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
  name: (identifier) @name) @class

; Exported classes
(export_statement
  (class_declaration
    name: (identifier) @name)) @class

; Exported functions
(export_statement
  (function_declaration
    name: (identifier) @name)) @function
