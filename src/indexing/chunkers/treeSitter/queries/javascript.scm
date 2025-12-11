; JavaScript Query Patterns for extracting semantic code units

; ===== FUNCTIONS =====

; Function declarations (regular, async, generator)
(function_declaration
  name: (identifier) @name) @function

(generator_function_declaration
  name: (identifier) @name) @function

; Arrow functions in const/let/var declarations
(lexical_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function) (generator_function)]) @value) @function

(variable_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function) (generator_function)]) @value) @function

; Exported function declarations
(export_statement
  (function_declaration
    name: (identifier) @name)) @function

(export_statement
  (generator_function_declaration
    name: (identifier) @name)) @function

; Exported arrow functions
(export_statement
  (lexical_declaration
    (variable_declarator
      name: (identifier) @name
      value: [(arrow_function) (function)]) @value)) @function

; Default exported functions
(export_statement
  value: (function_declaration
    name: (identifier) @name)) @function

(export_statement
  value: (arrow_function)) @function

; ===== CLASSES =====

; Class declarations
(class_declaration
  name: (identifier) @name) @class

; Exported classes
(export_statement
  (class_declaration
    name: (identifier) @name)) @class

; Default exported class
(export_statement
  value: (class_declaration
    name: (identifier) @name)) @class

; ===== METHODS =====

; Method definitions (including getters, setters, async)
(method_definition
  name: [(property_identifier) (private_property_identifier)] @name) @method

; ===== OBJECT PROPERTIES =====

; Object methods (shorthand)
(pair
  key: (property_identifier) @name
  value: [(function) (arrow_function)]) @function
