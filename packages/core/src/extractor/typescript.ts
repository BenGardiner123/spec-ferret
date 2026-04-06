import Parser from "tree-sitter";
import tsLanguage from "tree-sitter-typescript";

export type ContractType =
  | "api"
  | "table"
  | "type"
  | "event"
  | "flow"
  | "config";

export interface ExtractedCodeContract {
  id: string;
  type: ContractType;
  shape: Record<string, unknown>;
  sourceSymbol: string;
  filePath: string;
}

export interface TypeScriptExtractionResult {
  contracts: ExtractedCodeContract[];
  /** Hard failures — annotation parse errors, unmatched annotations, tree-sitter parse failures. */
  errors: string[];
  /** Soft warnings — unsupported type fallbacks, partial extractions. Detection succeeded but schema is approximate. */
  diagnostics: string[];
}

interface Annotation {
  id: string;
  type: ContractType;
  index: number;
}

interface ExportedDeclaration {
  kind: "interface" | "type" | "enum" | "function";
  symbol: string;
  node: Parser.SyntaxNode;
}

type Schema = Record<string, unknown>;

interface AnnotationOverridesResult {
  overrides: Map<string, Annotation>;
  errors: string[];
}

type TreeSitterLanguage = Parameters<Parser["setLanguage"]>[0];

const parser = new Parser();
parser.setLanguage(tsLanguage.typescript as TreeSitterLanguage);

function normalizeIdSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9/._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^[-./_]+)|([-./_]+$)/g, "");
}

function normalizeFilePathForId(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/\.[cm]?tsx?$/i, "");

  // Prefer repository-relative paths for deterministic ids. When absolute
  // paths are passed, keep from the first src/ segment when available.
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith("/")) {
    const segments = normalized.split("/").filter(Boolean);
    const srcIndex = segments.findIndex((segment) => segment.toLowerCase() === "src");

    if (srcIndex >= 0) {
      return segments.slice(srcIndex).join("/");
    }

    // Fallback to the last 3 path segments to reduce machine-specific prefixes.
    return segments.slice(-3).join("/");
  }

  return normalized;
}

function inferContractType(): ContractType {
  // Inferred extraction currently emits the strict six-core-type set and
  // defaults to `type` unless an annotation override supplies another type.
  return "type";
}

function inferContractId(filePath: string, symbol: string): string {
  const normalizedPath = normalizeFilePathForId(filePath);
  const pathPart = normalizeIdSegment(normalizedPath) || "source";
  const symbolPart = normalizeIdSegment(symbol) || "contract";
  return `type.${pathPart}/${symbolPart}`;
}

function allocateDeterministicInferredId(
  baseId: string,
  seenCounts: Map<string, number>,
  allocatedIds: Map<string, string>,
  diagnostics: string[],
  filePath: string,
  symbol: string,
): string {
  let count = (seenCounts.get(baseId) ?? 0) + 1;
  let allocatedId = count === 1 ? baseId : `${baseId}-${count}`;

  while (allocatedIds.has(allocatedId)) {
    count += 1;
    allocatedId = `${baseId}-${count}`;
  }

  seenCounts.set(baseId, count);
  if (allocatedId !== baseId) {
    diagnostics.push(
      `${filePath} (${symbol}): Inferred id collision for '${baseId}'. Assigned deterministic suffix '${allocatedId}'.`,
    );
  }

  allocatedIds.set(allocatedId, symbol);
  return allocatedId;
}

function toSchemaType(text: string): Schema {
  switch (text) {
    case "string":
      return { type: "string" };
    case "number":
    case "bigint":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "null":
      return { type: "null" };
    case "Date":
      return { type: "string", format: "date-time" };
    case "unknown":
    case "any":
      return { type: "object" };
    default:
      return { type: "object" };
  }
}

function getIdentifierText(node: Parser.SyntaxNode | null): string | null {
  if (!node) return null;
  if (
    node.type === "identifier" ||
    node.type === "property_identifier" ||
    node.type === "type_identifier"
  ) {
    return node.text;
  }

  const idNode = node.namedChildren.find(
    (child) =>
      child.type === "identifier" ||
      child.type === "property_identifier" ||
      child.type === "type_identifier",
  );
  return idNode ? idNode.text : null;
}

function extractAnnotationOverrides(
  filePath: string,
  content: string,
): AnnotationOverridesResult {
  const annotations = parseAnnotations(content);
  const overrides = new Map<string, Annotation>();
  const errors: string[] = [];

  for (const annotation of annotations) {
    const declaration = extractDeclaration(content, annotation.index);
    if (declaration.error) {
      errors.push(`${filePath}: ${declaration.error}`);
      continue;
    }

    overrides.set(declaration.symbol, annotation);
  }

  return { overrides, errors };
}

function collectExportedDeclarations(
  root: Parser.SyntaxNode,
): ExportedDeclaration[] {
  const declarations: ExportedDeclaration[] = [];

  for (const node of root.namedChildren) {
    if (node.type !== "export_statement") {
      continue;
    }

    const declaration = node.namedChildren.find((child) =>
      [
        "interface_declaration",
        "type_alias_declaration",
        "enum_declaration",
        "function_declaration",
      ].includes(child.type),
    );

    if (!declaration) {
      continue;
    }

    const symbolNode = declaration.childForFieldName("name");
    const symbol = getIdentifierText(symbolNode);
    if (!symbol) {
      continue;
    }

    if (declaration.type === "interface_declaration") {
      declarations.push({ kind: "interface", symbol, node: declaration });
      continue;
    }

    if (declaration.type === "type_alias_declaration") {
      declarations.push({ kind: "type", symbol, node: declaration });
      continue;
    }

    if (declaration.type === "enum_declaration") {
      declarations.push({ kind: "enum", symbol, node: declaration });
      continue;
    }

    declarations.push({ kind: "function", symbol, node: declaration });
  }

  return declarations;
}

function findChildByType(
  node: Parser.SyntaxNode,
  types: string[],
): Parser.SyntaxNode | null {
  return node.namedChildren.find((child) => types.includes(child.type)) ?? null;
}

function parseTypeNode(
  filePath: string,
  symbol: string,
  node: Parser.SyntaxNode,
  diagnostics: string[],
): Schema {
  if (node.type === "type_annotation") {
    const inner = node.namedChildren[0];
    if (!inner) {
      return { type: "object" };
    }
    return parseTypeNode(filePath, symbol, inner, diagnostics);
  }

  if (node.type === "predefined_type") {
    return toSchemaType(node.text);
  }

  if (node.type === "type_identifier") {
    if (node.text === "Date") {
      return { type: "string", format: "date-time" };
    }

    diagnostics.push(
      `${filePath} (${symbol}): Unsupported referenced type '${node.text}'. Falling back to object.`,
    );
    return { type: "object" };
  }

  if (node.type === "array_type") {
    const element = node.namedChildren[0];
    if (!element) {
      diagnostics.push(
        `${filePath} (${symbol}): Unable to parse array element type. Falling back to object items.`,
      );
      return { type: "array", items: { type: "object" } };
    }

    return {
      type: "array",
      items: parseTypeNode(filePath, symbol, element, diagnostics),
    };
  }

  if (node.type === "union_type") {
    diagnostics.push(
      `${filePath} (${symbol}): Union types are not supported in extraction. Falling back to object.`,
    );
    return { type: "object" };
  }

  if (node.type === "intersection_type") {
    diagnostics.push(
      `${filePath} (${symbol}): Intersection types are not supported in extraction. Falling back to object.`,
    );
    return { type: "object" };
  }

  if (node.type === "literal_type") {
    const valueNode = node.namedChildren[0];
    if (!valueNode) {
      return { type: "object" };
    }

    if (valueNode.type === "string") {
      return { type: "string", enum: [valueNode.text.slice(1, -1)] };
    }

    if (valueNode.type === "number") {
      return { type: "number", enum: [Number(valueNode.text)] };
    }

    if (valueNode.type === "true" || valueNode.type === "false") {
      return { type: "boolean", enum: [valueNode.type === "true"] };
    }

    return { type: "object" };
  }

  if (node.type === "parenthesized_type") {
    const inner = node.namedChildren[0];
    if (!inner) {
      return { type: "object" };
    }
    return parseTypeNode(filePath, symbol, inner, diagnostics);
  }

  if (node.type === "object_type" || node.type === "interface_body") {
    return parseObjectShape(filePath, symbol, node, diagnostics);
  }

  if (node.type === "function_type") {
    const parameters = node.childForFieldName("parameters");
    const returnType = node.childForFieldName("return_type");

    return {
      type: "object",
      properties: {
        params: parseParametersShape(filePath, symbol, parameters, diagnostics),
        returns: returnType
          ? parseTypeNode(filePath, symbol, returnType, diagnostics)
          : { type: "object" },
      },
      required: ["params", "returns"],
    };
  }

  diagnostics.push(
    `${filePath} (${symbol}): Unsupported node type '${node.type}'. Falling back to object.`,
  );
  return { type: "object" };
}

function parseObjectShape(
  filePath: string,
  symbol: string,
  node: Parser.SyntaxNode,
  diagnostics: string[],
): Schema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  const members = node.namedChildren.filter((child) =>
    ["property_signature", "method_signature"].includes(child.type),
  );

  for (const member of members) {
    const nameNode =
      member.childForFieldName("name") ??
      findChildByType(member, ["property_identifier", "identifier", "string"]);
    const propertyName =
      getIdentifierText(nameNode) ??
      nameNode?.text?.replace(/^['"]|['"]$/g, "");

    if (!propertyName) {
      diagnostics.push(
        `${filePath} (${symbol}): Unable to parse property name in object type.`,
      );
      continue;
    }

    // Check for a '?' token that is a direct (unnamed) child of the member node.
    // This correctly distinguishes optional properties (bar?: string) from required
    // methods that happen to have optional parameters (fn(x?: string): void).
    const optional = member.children.some(
      (child) => !child.isNamed && child.text === "?",
    );
    let schema: Schema;

    if (member.type === "method_signature") {
      const parameters = member.childForFieldName("parameters");
      const returnType = member.childForFieldName("return_type");
      schema = {
        type: "object",
        properties: {
          params: parseParametersShape(
            filePath,
            symbol,
            parameters,
            diagnostics,
          ),
          returns: returnType
            ? parseTypeNode(filePath, symbol, returnType, diagnostics)
            : { type: "object" },
        },
        required: ["params", "returns"],
      };
    } else {
      const typeNode =
        member.childForFieldName("type") ??
        member.childForFieldName("value") ??
        findChildByType(member, [
          "type_annotation",
          "predefined_type",
          "type_identifier",
          "array_type",
          "union_type",
          "intersection_type",
          "object_type",
          "literal_type",
          "parenthesized_type",
          "function_type",
        ]);

      if (!typeNode) {
        diagnostics.push(
          `${filePath} (${symbol}): Unable to parse type expression for property '${propertyName}'.`,
        );
        schema = { type: "object" };
      } else {
        schema = parseTypeNode(filePath, symbol, typeNode, diagnostics);
      }
    }

    properties[propertyName] = schema;
    if (!optional) {
      required.push(propertyName);
    }
  }

  return {
    type: "object",
    properties,
    required,
  };
}

function parseParametersShape(
  filePath: string,
  symbol: string,
  parametersNode: Parser.SyntaxNode | null,
  diagnostics: string[],
): Schema {
  if (!parametersNode) {
    return { type: "object", properties: {}, required: [] };
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const parameter of parametersNode.namedChildren) {
    if (
      !["required_parameter", "optional_parameter", "rest_parameter"].includes(
        parameter.type,
      )
    ) {
      continue;
    }

    const nameNode =
      parameter.childForFieldName("pattern") ??
      parameter.childForFieldName("name") ??
      // rest_parameter exposes its identifier as a direct named child with no field name
      parameter.namedChildren.find((c) => c.type === "identifier") ??
      null;
    const parameterName = getIdentifierText(nameNode) ?? "arg";
    const typeNode =
      parameter.childForFieldName("type") ??
      findChildByType(parameter, [
        "type_annotation",
        "predefined_type",
        "type_identifier",
        "array_type",
        "union_type",
        "intersection_type",
        "object_type",
      ]);

    properties[parameterName] = typeNode
      ? parseTypeNode(filePath, symbol, typeNode, diagnostics)
      : { type: "object" };

    // A rest parameter is represented as required_parameter with a rest_pattern child.
    // It can be called with zero arguments, so it must not appear in required[].
    const isRestParameter = parameter.namedChildren.some(
      (c) => c.type === "rest_pattern",
    );
    if (
      parameter.type !== "optional_parameter" &&
      parameter.type !== "rest_parameter" &&
      !isRestParameter
    ) {
      required.push(parameterName);
    }
  }

  return {
    type: "object",
    properties,
    required,
  };
}

function parseEnumShape(node: Parser.SyntaxNode): Schema {
  const body =
    node.childForFieldName("body") ?? findChildByType(node, ["enum_body"]);
  if (!body) {
    return { type: "string", enum: [] };
  }

  const values = body.namedChildren
    .map((child) => {
      // Bare member: Admin
      if (child.type === "property_identifier" || child.type === "identifier") {
        return child.text;
      }
      // Valued member: Admin = "admin" or Admin = 1
      if (child.type === "enum_assignment") {
        const nameChild = child.namedChildren.find(
          (c) => c.type === "property_identifier" || c.type === "identifier",
        );
        return nameChild?.text ?? null;
      }
      return null;
    })
    .filter((v): v is string => v !== null);

  return {
    type: "string",
    enum: values,
  };
}

function parseDeclarationShape(
  filePath: string,
  declaration: ExportedDeclaration,
  diagnostics: string[],
): Schema {
  if (declaration.kind === "interface") {
    const body =
      declaration.node.childForFieldName("body") ??
      findChildByType(declaration.node, ["interface_body"]);
    if (!body) {
      diagnostics.push(
        `${filePath} (${declaration.symbol}): Interface body was not found. Falling back to object.`,
      );
      return { type: "object", properties: {}, required: [] };
    }

    return parseObjectShape(filePath, declaration.symbol, body, diagnostics);
  }

  if (declaration.kind === "type") {
    const valueNode =
      declaration.node.childForFieldName("value") ??
      declaration.node.namedChildren.at(-1);
    if (!valueNode) {
      diagnostics.push(
        `${filePath} (${declaration.symbol}): Type alias value was not found. Falling back to object.`,
      );
      return { type: "object" };
    }

    return parseTypeNode(filePath, declaration.symbol, valueNode, diagnostics);
  }

  if (declaration.kind === "enum") {
    return parseEnumShape(declaration.node);
  }

  const parameters = declaration.node.childForFieldName("parameters");
  const returnType = declaration.node.childForFieldName("return_type");

  return {
    type: "object",
    properties: {
      params: parseParametersShape(
        filePath,
        declaration.symbol,
        parameters,
        diagnostics,
      ),
      returns: returnType
        ? parseTypeNode(filePath, declaration.symbol, returnType, diagnostics)
        : { type: "object" },
    },
    required: ["params", "returns"],
  };
}

function parseAnnotations(content: string): Annotation[] {
  const pattern =
    /^\s*\/\/\s*@ferret-contract:\s*([^\s]+)\s+(api|table|type|event|flow|config)\s*$/gm;
  const out: Annotation[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    out.push({
      id: match[1],
      type: match[2] as ContractType,
      index: match.index + match[0].length,
    });
  }

  return out;
}

function extractDeclaration(
  content: string,
  start: number,
): {
  symbol: string;
  error?: string;
} {
  const tail = content.slice(start);
  const decl = /(?:export\s+)?(interface|type)\s+([A-Za-z0-9_]+)/m.exec(tail);

  if (!decl) {
    return {
      symbol: "unknown",
      error: "No interface/type declaration found after annotation.",
    };
  }

  return { symbol: decl[2] };
}

export function extractContractsFromTypeScript(
  filePath: string,
  content: string,
): TypeScriptExtractionResult {
  const annotationResult = extractAnnotationOverrides(filePath, content);
  const annotationOverrides = annotationResult.overrides;
  const contracts: ExtractedCodeContract[] = [];
  const inferredIdCounts = new Map<string, number>();
  const allocatedIds = new Map<string, string>();
  const errors: string[] = [...annotationResult.errors];
  const diagnostics: string[] = [];

  let tree: Parser.Tree;
  try {
    tree = parser.parse(content);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parse error.";
    errors.push(`${filePath}: Tree-sitter parse failed: ${message}`);
    return { contracts, errors, diagnostics };
  }

  if (tree.rootNode.hasError) {
    diagnostics.push(
      `${filePath}: Tree-sitter detected syntax errors; extraction may be partial.`,
    );
  }

  const declarations = collectExportedDeclarations(tree.rootNode);

  for (const declaration of declarations) {
    const shape = parseDeclarationShape(filePath, declaration, diagnostics);
    const override = annotationOverrides.get(declaration.symbol);
    let allocatedId: string;

    if (override?.id) {
      const existingOwner = allocatedIds.get(override.id);
      if (existingOwner && existingOwner !== declaration.symbol) {
        errors.push(
          `${filePath} (${declaration.symbol}): Annotation id '${override.id}' duplicates id already used by '${existingOwner}'.`,
        );
        continue;
      }
      allocatedId = override.id;
      allocatedIds.set(allocatedId, declaration.symbol);
    } else {
      const inferredId = inferContractId(filePath, declaration.symbol);
      allocatedId = allocateDeterministicInferredId(
        inferredId,
        inferredIdCounts,
        allocatedIds,
        diagnostics,
        filePath,
        declaration.symbol,
      );
    }

    contracts.push({
      id: allocatedId,
      type: override?.type ?? inferContractType(),
      shape,
      sourceSymbol: declaration.symbol,
      filePath,
    });
  }

  for (const [symbol, annotation] of annotationOverrides.entries()) {
    if (contracts.some((contract) => contract.sourceSymbol === symbol)) {
      continue;
    }

    errors.push(
      `${filePath}: Annotation for '${annotation.id}' did not match an exported declaration.`,
    );
  }

  contracts.sort((a, b) =>
    a.id === b.id
      ? a.sourceSymbol.localeCompare(b.sourceSymbol)
      : a.id.localeCompare(b.id),
  );

  return { contracts, errors, diagnostics };
}
