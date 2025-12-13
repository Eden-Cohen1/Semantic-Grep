/**
 * CintraCodeParser - AST-based code parser
 * Ported from CintraAI/code-chunker Python implementation
 *
 * Extracts points of interest (functions, classes, etc.) and comments
 * from code using Tree-sitter AST parsing.
 */

import Parser from "web-tree-sitter";
import { Logger } from "../../../utils/logger";
import { LanguageRegistry } from "./LanguageRegistry";

/**
 * Represents a point of interest in the code
 */
export interface PointOfInterest {
    node: Parser.SyntaxNode;
    type: string;
    line: number; // 0-indexed line number
}

/**
 * Extension to language name mapping (web development languages only)
 */
const LANGUAGE_EXTENSION_MAP: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    css: "css",
    ts: "typescript",
    tsx: "typescript",
    vue: "vue",
};

/**
 * Node types of interest per file extension
 * Web development languages only
 */
const NODE_TYPES_OF_INTEREST: Record<string, Record<string, string>> = {
    css: {
        rule_set: "Rule",
        media_statement: "Media Query",
        keyframes_statement: "Keyframes",
    },
    js: {
        import_statement: "Import",
        export_statement: "Export",
        class_declaration: "Class",
        function_declaration: "Function",
        lexical_declaration: "Variable",
        variable_declaration: "Variable",
    },
    jsx: {
        import_statement: "Import",
        export_statement: "Export",
        class_declaration: "Class",
        function_declaration: "Function",
        lexical_declaration: "Variable",
        variable_declaration: "Variable",
        // JSX-specific nodes
        jsx_element: "JSX",
        jsx_self_closing_element: "JSX",
        jsx_fragment: "JSX",
    },
    ts: {
        import_statement: "Import",
        export_statement: "Export",
        class_declaration: "Class",
        abstract_class_declaration: "Abstract Class",
        function_declaration: "Function",
        function_signature: "Function Signature",
        interface_declaration: "Interface",
        type_alias_declaration: "Type Alias",
        enum_declaration: "Enum",
        lexical_declaration: "Variable",
        variable_declaration: "Variable",
        module: "Module",
        ambient_declaration: "Ambient",
    },
    tsx: {
        import_statement: "Import",
        export_statement: "Export",
        class_declaration: "Class",
        abstract_class_declaration: "Abstract Class",
        function_declaration: "Function",
        function_signature: "Function Signature",
        interface_declaration: "Interface",
        type_alias_declaration: "Type Alias",
        enum_declaration: "Enum",
        lexical_declaration: "Variable",
        variable_declaration: "Variable",
        module: "Module",
        ambient_declaration: "Ambient",
        // JSX-specific nodes
        jsx_element: "JSX",
        jsx_self_closing_element: "JSX",
        jsx_fragment: "JSX",
    },
    vue: {
        script_element: "Script",
        template_element: "Template",
        style_element: "Style",
    },
};

/**
 * Node types for comments per file extension
 */
const COMMENT_NODE_TYPES: Record<string, Record<string, string>> = {
    css: { comment: "Comment" },
    js: { comment: "Comment" },
    jsx: { comment: "Comment" },
    ts: { comment: "Comment" },
    tsx: { comment: "Comment" },
    vue: { comment: "Comment" },
};

/**
 * CintraCodeParser - Extracts semantic information from code using Tree-sitter
 */
export class CintraCodeParser {
    private logger = new Logger("CintraCodeParser");
    private parser: Parser | null = null;

    constructor() {
        this.logger.debug("CintraCodeParser initialized");
    }

    /**
     * Get the language name from file extension
     */
    getLanguageName(extension: string): string | null {
        return LANGUAGE_EXTENSION_MAP[extension.toLowerCase()] || null;
    }

    /**
     * Parse code and return the root node
     */
    async parseCode(
        code: string,
        extension: string
    ): Promise<Parser.SyntaxNode | null> {
        const languageName = this.getLanguageName(extension);
        if (!languageName) {
            this.logger.debug(`Unsupported file type: ${extension}`);
            return null;
        }

        const language = await LanguageRegistry.getLanguage(extension);
        if (!language) {
            this.logger.debug(`Language parser not found for ${extension}`);
            return null;
        }

        if (!this.parser) {
            this.parser = new Parser();
        }

        this.parser.setLanguage(language);
        const tree = this.parser.parse(code);

        if (!tree) {
            this.logger.debug("Failed to parse the code");
            return null;
        }

        return tree.rootNode;
    }

    /**
     * Get node types of interest for a file extension
     */
    private getNodeTypesOfInterest(extension: string): Record<string, string> {
        const ext = extension.toLowerCase();
        return NODE_TYPES_OF_INTEREST[ext] || {};
    }

    /**
     * Get comment node types for a file extension
     */
    private getCommentNodeTypes(extension: string): Record<string, string> {
        const ext = extension.toLowerCase();
        return COMMENT_NODE_TYPES[ext] || {};
    }

    /**
     * Extract points of interest with nested function support
     * - Depth 0: Extract ALL declaration types (top-level)
     * - Depth 1-2: Extract ONLY functions (nested functions)
     */
    extractPointsOfInterest(
        node: Parser.SyntaxNode,
        extension: string
    ): PointOfInterest[] {
        const nodeTypesOfInterest = this.getNodeTypesOfInterest(extension);
        const pointsOfInterest: PointOfInterest[] = [];

        this.logger.debug(`Root node type: ${node.type}, children: ${node.childCount}`);

        // Helper to check if a node or its children contain a function
        const getFunctionNode = (node: Parser.SyntaxNode): Parser.SyntaxNode | null => {
            // Direct function types
            if (node.type === 'arrow_function' || node.type === 'function' || node.type === 'function_expression') {
                return node;
            }

            // For lexical_declaration (const x = () => {}), look for arrow_function child
            if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
                for (const child of node.children) {
                    if (child.type === 'variable_declarator') {
                        // Look in the declarator for arrow_function or function
                        for (const grandchild of child.children) {
                            if (grandchild.type === 'arrow_function' || grandchild.type === 'function_expression') {
                                return grandchild;
                            }
                        }
                    }
                }
            }

            return null;
        };

        /**
         * Recursive extraction with depth tracking
         * @param currentNode Node to process
         * @param depth Current depth (0 = top-level)
         */
        const extractWithDepth = (currentNode: Parser.SyntaxNode, depth: number) => {
            for (const child of currentNode.children) {
                const nodeType = child.type;

                // Depth 0: Extract ALL types of interest (top-level declarations)
                if (depth === 0 && nodeType in nodeTypesOfInterest) {
                    this.logger.debug(`[Depth ${depth}] Found ${nodeType} at line ${child.startPosition.row}`);
                    pointsOfInterest.push({
                        node: child,
                        type: nodeTypesOfInterest[nodeType],
                        line: child.startPosition.row,
                    });
                }

                // Depth 1-3: Extract ONLY functions and JSX elements
                // Increased to depth 3 to catch more nested functions
                if (depth > 0 && depth <= 3) {
                    // Check for return statements containing JSX (React components)
                    // This ensures we get the exact line where JSX starts
                    if (nodeType === 'return_statement') {
                        // Look for JSX inside the return statement
                        for (const returnChild of child.children) {
                            const isJSXInReturn = returnChild.type === 'jsx_element' ||
                                                  returnChild.type === 'jsx_self_closing_element' ||
                                                  returnChild.type === 'jsx_fragment' ||
                                                  returnChild.type === 'parenthesized_expression'; // return (<div>)

                            if (isJSXInReturn) {
                                const nodeLineCount = child.endPosition.row - child.startPosition.row + 1;
                                if (nodeLineCount >= 3) {
                                    this.logger.debug(`[Depth ${depth}] Found return statement with JSX at line ${child.startPosition.row} (${nodeLineCount} lines)`);
                                    pointsOfInterest.push({
                                        node: child,
                                        type: "JSX",
                                        line: child.startPosition.row,
                                    });
                                    break; // Only create one breakpoint per return statement
                                }
                            }
                        }
                    }

                    // Check for standalone JSX elements (not in return statements)
                    const isJSX = nodeType === 'jsx_element' ||
                                  nodeType === 'jsx_self_closing_element' ||
                                  nodeType === 'jsx_fragment';

                    if (isJSX) {
                        const nodeLineCount = child.endPosition.row - child.startPosition.row + 1;
                        // Only extract JSX blocks that are substantial (>= 3 lines)
                        if (nodeLineCount >= 3) {
                            this.logger.debug(`[Depth ${depth}] Found JSX element at line ${child.startPosition.row} (${nodeLineCount} lines)`);
                            pointsOfInterest.push({
                                node: child,
                                type: "JSX",
                                line: child.startPosition.row,
                            });
                        }
                    }

                    // Check if this is a function or contains one
                    const funcNode = getFunctionNode(child);

                    if (funcNode || nodeType === 'function_declaration' || nodeType === 'method_definition') {
                        // Use the actual function node for size calculation
                        const targetNode = funcNode || child;
                        const nodeLineCount = targetNode.endPosition.row - targetNode.startPosition.row + 1;

                        // Lower threshold to 1 line to catch even small functions
                        if (nodeLineCount >= 1) {
                            this.logger.debug(`[Depth ${depth}] Found nested function '${nodeType}' at line ${child.startPosition.row} (${nodeLineCount} lines)`);
                            pointsOfInterest.push({
                                node: child,
                                type: "Function",
                                line: child.startPosition.row,
                            });
                        }
                    }
                }

                // Recurse into children up to depth 3
                if (depth < 3) {
                    extractWithDepth(child, depth + 1);
                }
            }
        };

        // Start extraction from root
        extractWithDepth(node, 0);

        // Post-process: group consecutive imports
        const filtered = this.groupConsecutiveImports(pointsOfInterest);

        this.logger.debug(`Total breakpoints found: ${filtered.length} (${pointsOfInterest.length} before import grouping)`);
        return filtered;
    }

    /**
     * Group consecutive import statements into a single chunk
     * Keeps only the FIRST import in a consecutive block of imports
     */
    private groupConsecutiveImports(points: PointOfInterest[]): PointOfInterest[] {
        if (points.length === 0) return points;

        // Sort by line number first
        const sorted = [...points].sort((a, b) => a.line - b.line);
        const result: PointOfInterest[] = [];
        let inImportBlock = false;

        for (const point of sorted) {
            const isImportOrExport = point.type === "Import" || point.type === "Export";

            if (isImportOrExport) {
                // If we're not already in an import block, this is the first import - keep it
                if (!inImportBlock) {
                    result.push(point);
                    inImportBlock = true;
                    this.logger.debug(`Starting import block at line ${point.line}`);
                } else {
                    // We're in an import block, skip this import
                    this.logger.debug(`Skipping ${point.type} at line ${point.line} (part of import block)`);
                }
            } else {
                // Not an import/export, end the import block and keep this point
                if (inImportBlock) {
                    this.logger.debug(`Ending import block before line ${point.line}`);
                    inImportBlock = false;
                }
                result.push(point);
            }
        }

        return result;
    }

    /**
     * Extract comments recursively (comments can be anywhere)
     */
    extractComments(
        node: Parser.SyntaxNode,
        extension: string
    ): PointOfInterest[] {
        const commentNodeTypes = this.getCommentNodeTypes(extension);
        const comments: PointOfInterest[] = [];

        if (node.type in commentNodeTypes) {
            comments.push({
                node,
                type: commentNodeTypes[node.type],
                line: node.startPosition.row,
            });
        }

        for (const child of node.children) {
            comments.push(...this.extractComments(child, extension));
        }

        return comments;
    }

    /**
     * Get line numbers where points of interest occur
     * @returns Array of 0-indexed line numbers
     */
    async getLinesForPointsOfInterest(
        code: string,
        extension: string
    ): Promise<number[]> {
        const rootNode = await this.parseCode(code, extension);
        if (!rootNode) {
            this.logger.warn("Failed to parse code, returning empty breakpoints");
            return [];
        }

        const pointsOfInterest = this.extractPointsOfInterest(rootNode, extension);

        // Get unique line numbers
        const lineSet = new Set<number>();
        for (const poi of pointsOfInterest) {
            lineSet.add(poi.line);
        }

        const lines = Array.from(lineSet).sort((a, b) => a - b);
        this.logger.info(`Breakpoints at lines: [${lines.join(", ")}]`);

        return lines;
    }

    /**
     * Get line numbers where comments occur
     * @returns Array of 0-indexed line numbers
     */
    async getLinesForComments(
        code: string,
        extension: string
    ): Promise<number[]> {
        const rootNode = await this.parseCode(code, extension);
        if (!rootNode) {
            return [];
        }

        const comments = this.extractComments(rootNode, extension);
        const lineSet = new Set<number>();
        for (const comment of comments) {
            lineSet.add(comment.line);
        }

        return Array.from(lineSet);
    }

    /**
     * Debug method: print all top-level node types
     */
    async debugNodeTypes(code: string, extension: string): Promise<string[]> {
        const rootNode = await this.parseCode(code, extension);
        if (!rootNode) {
            return [];
        }

        const types: string[] = [];
        for (const child of rootNode.children) {
            const info = `Line ${child.startPosition.row}: ${child.type}`;
            types.push(info);
            this.logger.info(info);
        }
        return types;
    }

    /**
     * Check if an extension is supported
     */
    supportsExtension(extension: string): boolean {
        return extension.toLowerCase() in LANGUAGE_EXTENSION_MAP;
    }

    /**
     * Get all supported extensions
     */
    getSupportedExtensions(): string[] {
        return Object.keys(LANGUAGE_EXTENSION_MAP);
    }

    /**
     * Cleanup resources
     */
    dispose(): void {
        if (this.parser) {
            this.parser.delete();
            this.parser = null;
        }
        this.logger.debug("CintraCodeParser disposed");
    }
}
