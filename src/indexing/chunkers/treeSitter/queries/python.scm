; Python Query Patterns for extracting semantic code units

; Function definitions
(function_definition
  name: (identifier) @name) @function

; Async function definitions
(function_definition
  (async) @async
  name: (identifier) @name) @function

; Class definitions
(class_definition
  name: (identifier) @name) @class

; Decorated function definitions
(decorated_definition
  (decorator)* @decorators
  definition: (function_definition
    name: (identifier) @name)) @function

; Decorated class definitions
(decorated_definition
  (decorator)* @decorators
  definition: (class_definition
    name: (identifier) @name)) @class
