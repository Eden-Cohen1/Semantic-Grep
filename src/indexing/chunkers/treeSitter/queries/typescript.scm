; TypeScript Query Patterns for extracting semantic code units

; ===== FUNCTIONS =====

; Function declarations (regular and async)
(function_declaration
  name: (identifier) @name) @function

; Generator functions
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
  name: (type_identifier) @name) @class

; Abstract classes
(abstract_class_declaration
  name: (type_identifier) @name) @class

; Exported classes
(export_statement
  (class_declaration
    name: (type_identifier) @name)) @class

(export_statement
  (abstract_class_declaration
    name: (type_identifier) @name)) @class

; ===== METHODS =====

; Method definitions (including getters, setters, async)
(method_definition
  name: [(property_identifier) (private_property_identifier)] @name) @method

; Method signatures in interfaces
(method_signature
  name: (property_identifier) @name) @method

; ===== INTERFACES AND TYPES =====

; Interface declarations
(interface_declaration
  name: (type_identifier) @name) @interface

; Exported interfaces
(export_statement
  (interface_declaration
    name: (type_identifier) @name)) @interface

; Type alias declarations
(type_alias_declaration
  name: (type_identifier) @name) @type

; Exported type aliases
(export_statement
  (type_alias_declaration
    name: (type_identifier) @name)) @type

; Enum declarations
(enum_declaration
  name: (identifier) @name) @type

; Exported enums
(export_statement
  (enum_declaration
    name: (identifier) @name)) @type

; ===== NAMESPACE AND MODULE =====

; Namespace declarations
(module
  name: (identifier) @name) @namespace

(internal_module
  name: (identifier) @name) @namespace

; ===== DECORATORS =====

; Class with decorators
(decorated_definition
  (decorator)* @decorators
  definition: (class_declaration
    name: (type_identifier) @name)) @class

; Method with decorators
(decorated_definition
  (decorator)* @decorators
  definition: (method_definition
    name: (property_identifier) @name)) @method
