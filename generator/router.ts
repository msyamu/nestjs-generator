import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import * as path from 'path';
import { load } from 'js-yaml';
import * as Mustache from 'mustache';
import { OpenAPIV3 } from 'openapi-types';

const OPENAPI_YAML_PATH = './openapi.yaml';
const CONTROLLERS_OUTPUT_DIR = './src/generated/controllers';
const INTERFACES_OUTPUT_DIR = './src/generated/controllers/interfaces';

const EXTERNAL_DECORATORS: {
  [decoratorName: string]: { importFrom: string; importName?: string };
} = {
  Controller: { importFrom: '@nestjs/common' },
  Inject: { importFrom: '@nestjs/common' },
  Get: { importFrom: '@nestjs/common' },
  Post: { importFrom: '@nestjs/common' },
  Put: { importFrom: '@nestjs/common' },
  Delete: { importFrom: '@nestjs/common' },
  Patch: { importFrom: '@nestjs/common' },
  Param: { importFrom: '@nestjs/common' },
  Query: { importFrom: '@nestjs/common' },
  Body: { importFrom: '@nestjs/common' },
  HttpCode: { importFrom: '@nestjs/common' },
  Req: { importFrom: '@nestjs/common' },
  Res: { importFrom: '@nestjs/common' },
  Auth: { importFrom: '../../decorators/auth' },
};
const EXTERNAL_TYPES: { [typeName: string]: string } = {
  Request: 'express',
  Response: 'express',
};
const BUILT_IN_TYPES = [
  'string',
  'number',
  'boolean',
  'any',
  'void',
  'unknown',
];
const DECORATOR_MAPPING: DecoratorMapping = {
  operationDecorators: {
    'x-auth-required': {
      decoratorName: 'Auth',
      argsTransform: (value: boolean) => [value ? 'true' : 'false'],
    },
  },
  parameterDecorators: {
    UserId: {
      decoratorName: 'Auth.UserId',
      variableName: 'currentUserId',
      type: 'number',
      importDecorator: 'Auth',
    },
    Req: {
      decoratorName: 'Req',
      variableName: 'request',
      type: 'Request',
    },
    Res: {
      decoratorName: 'Res',
      variableName: 'response',
      type: 'Response',
    },
  },
};

class ImportManager {
  private importMap: Map<string, Set<string>> = new Map();

  addDecoratorImport(decoratorName: string) {
    const baseDecoratorName = decoratorName.split('.')[0];
    const decoratorInfo = EXTERNAL_DECORATORS[baseDecoratorName];
    if (!decoratorInfo) {
      throw new Error(`Decorator "${baseDecoratorName}" not found in EXTERNAL_DECORATORS mapping.`);
    }
    const importFrom = decoratorInfo.importFrom;
    const importName = decoratorInfo.importName || baseDecoratorName;
    this.addImport(importFrom, importName);
  }

  addTypeImport(typeName: string) {
    const baseTypeNames = collectTypeImports(typeName);
    for (const baseTypeName of baseTypeNames) {
      const importFrom = this.getTypeImportFrom(baseTypeName);
      if (!importFrom) {
        continue;
      }
      for (const [key, namesSet] of this.importMap.entries()) {
        if (namesSet.has(baseTypeName) && key !== importFrom) {
          continue;
        }
      }
      this.addImport(importFrom, baseTypeName);
    }
  }

  addImportFromSource(importFrom: string, name: string) {
    this.addImport(importFrom, name);
  }

  private addImport(importFrom: string, name: string) {
    if (!this.importMap.has(importFrom)) {
      this.importMap.set(importFrom, new Set());
    }
    this.importMap.get(importFrom)!.add(name);
  }

  getImports() {
    return Array.from(this.importMap.entries()).map(([importFrom, namesSet]) => ({
      importFrom,
      names: Array.from(namesSet).sort(),
    }));
  }

  getSortedImports() {
    const importsArray = this.getImports();
    const externalImports = importsArray.filter(imp => isExternalImport(imp.importFrom));
    const internalImports = importsArray.filter(imp => !isExternalImport(imp.importFrom));
    const sortedExternalImports = externalImports.sort((a, b) => a.importFrom.localeCompare(b.importFrom));
    const sortedInternalImports = internalImports.sort((a, b) => a.importFrom.localeCompare(b.importFrom));
    return [...sortedExternalImports, ...sortedInternalImports];
  }

  private getTypeImportFrom(typeName: string): string | undefined {
    if (BUILT_IN_TYPES.includes(typeName)) {
      return undefined;
    }
    if (EXTERNAL_TYPES[typeName]) {
      return EXTERNAL_TYPES[typeName];
    }
    return '@openapi';
  }
}

interface DecoratorMapping {
  operationDecorators: {
    [metadataKey: string]: {
      decoratorName: string;
      argsTransform?: (args: any) => string[];
      variableName?: string;
    };
  };
  parameterDecorators: {
    [paramType: string]: {
      decoratorName: string;
      type: string;
      variableName?: string;
      importDecorator?: string;
    };
  };
}
interface ControllerData {
  className: string;
  fileName: string;
  basePath: string;
  interfaceName: string;
  interfaceVariableName: string;
  operations: OperationData[];
  importManager: ImportManager;
  paths: string[];
}
interface OperationData {
  httpMethod: string;
  operationId: string;
  fullPath: string;
  path?: string;
  parameters: ParameterData[];
  requestBody?: RequestBodyData;
  responseType: string;
  responseStatus: number;
  isHttpCodeDifferent: boolean;
  hasParams: boolean;
  hasQuery: boolean;
  hasBody: boolean;
  allParameters: AllParameterData[];
  customDecorators?: DecoratorData[];
}
interface DecoratorData {
  name: string;
  args?: string;
}
interface BaseParameterData {
  name: string;
  type: string;
  decorator?: string;
  required: boolean;
  location?: string;
  customDecorators?: DecoratorData[];
}
interface ParameterData extends BaseParameterData {
  location: string;
}
type RequestBodyData = BaseParameterData
interface AllParameterData {
  name: string;
  type: string;
  decorator?: string;
  required: boolean;
  parameterName?: string;
  customDecorators?: DecoratorData[];
}
interface ExtendedOperationObject extends OpenAPIV3.OperationObject {
  'x-internal-params'?: string[];
  'x-auth-required'?: boolean;
  'x-ignore-generate'?: boolean;
  [key: string]: any;
}

function generateControllers() {
  const openapiDocument = loadOpenApiYaml(OPENAPI_YAML_PATH);
  const controllers = extractControllers(openapiDocument);
  renderInterfaces(controllers, INTERFACES_OUTPUT_DIR);
  renderControllers(controllers, CONTROLLERS_OUTPUT_DIR);
}

function loadOpenApiYaml(filePath: string): OpenAPIV3.Document {
  const yamlContent = readFileSync(filePath, 'utf8');
  const document = load(yamlContent) as OpenAPIV3.Document;
  return document;
}

function extractControllers(openapiDoc: OpenAPIV3.Document): ControllerData[] {
  const paths = openapiDoc.paths;
  const controllersMap: { [controllerName: string]: ControllerData } = {};
  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;
    const normalizedPath = pathStr.replace(/{/g, ':').replace(/}/g, '');
    const tag = getFirstTag(pathItem);
    const className = `${pascalCase(tag)}BaseController`;
    const fileName = kebabCase(tag);
    if (!controllersMap[className]) {
      controllersMap[className] = {
        className,
        fileName,
        basePath: `/${fileName}`,
        interfaceName: `${pascalCase(tag)}Controller`,
        interfaceVariableName: camelCase(`${pascalCase(tag)}Controller`),
        operations: [],
        importManager: new ImportManager(),
        paths: [],
      };
    }
    const controller = controllersMap[className];
    addDefaultImports(controller);
    for (const method of Object.keys(pathItem)) {
      if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
        const operation = (pathItem as any)[method] as ExtendedOperationObject;
        if (operation['x-ignore-generate']) {
          continue;
        }
        const operationData = extractOperationData(method, normalizedPath, operation, openapiDoc, controller);
        controller.operations.push(operationData);
        controller.importManager.addDecoratorImport(capitalize(method));
        addNestJsDecoratorImports(operationData, controller);
      }
    }
    controller.paths.push(normalizedPath);
  }
  for (const controller of Object.values(controllersMap)) {
    controller.basePath = getCommonPathPrefix(controller.paths);
    for (const operation of controller.operations) {
      operation.path = getRelativePath(controller.basePath, operation.fullPath);
    }
  }
  return Object.values(controllersMap);
}

function addDefaultImports(controller: ControllerData) {
  controller.importManager.addDecoratorImport('Controller');
  controller.importManager.addDecoratorImport('Inject');
  const interfaceImportPath = `./interfaces/${controller.fileName}.controller`;
  controller.importManager.addImportFromSource(interfaceImportPath, controller.interfaceName);
}

function addNestJsDecoratorImports(operationData: OperationData, controller: ControllerData) {
  if (operationData.hasParams) {
    controller.importManager.addDecoratorImport('Param');
  }
  if (operationData.hasQuery) {
    controller.importManager.addDecoratorImport('Query');
  }
  if (operationData.isHttpCodeDifferent) {
    controller.importManager.addDecoratorImport('HttpCode');
  }
  if (operationData.hasBody) {
    controller.importManager.addDecoratorImport('Body');
  }
}

function getCommonPathPrefix(paths: string[]): string {
  if (!paths || paths.length === 0) return '';
  const splitPaths = paths.map(path => path.split('/').filter(seg => seg.length > 0));
  const minLength = Math.min(...splitPaths.map(segments => segments.length));
  const commonSegments: string[] = [];
  for (let i = 0; i < minLength; i++) {
    const segment = splitPaths[0][i];
    if (splitPaths.every(segments => segments[i] === segment)) {
      commonSegments.push(segment);
    } else {
      break;
    }
  }
  return '/' + commonSegments.join('/');
}

function getRelativePath(basePath: string, fullPath: string): string {
  if (fullPath.startsWith(basePath)) {
    const relativePath = fullPath.slice(basePath.length);
    return relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  } else {
    return fullPath;
  }
}

function getFirstTag(pathItem: OpenAPIV3.PathItemObject): string {
  for (const method of Object.keys(pathItem)) {
    if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
      const operation = (pathItem as any)[method] as OpenAPIV3.OperationObject;
      if (operation.tags && operation.tags.length > 0) {
        return operation.tags[0];
      }
    }
  }
  return 'Default';
}

function extractOperationPath(fullPath: string): string {
  const basePath = getBasePath(fullPath);
  const operationPath = fullPath.replace(basePath, '').replace(/^\//, '');
  return operationPath || '';
}

function getBasePath(fullPath: string): string {
  const segments = fullPath.split('/');
  return segments.slice(0, 2).join('/');
}

function extractOperationData(
  method: string,
  path: string,
  operation: ExtendedOperationObject,
  openapiDoc: OpenAPIV3.Document,
  controller: ControllerData,
): OperationData {
  const parameters: ParameterData[] = [];
  if (operation['x-internal-params']) {
    const internalParams = operation['x-internal-params'];
    for (const paramType of internalParams) {
      const mapping = DECORATOR_MAPPING.parameterDecorators[paramType];
      if (mapping) {
        const decoratorName = mapping.decoratorName;
        const name = mapping.variableName || paramType.charAt(0).toLowerCase() + paramType.slice(1);
        parameters.push({
          name,
          type: mapping.type,
          location: 'custom',
          required: true,
          customDecorators: [
            {
              name: decoratorName,
            },
          ],
        });
        controller.importManager.addTypeImport(mapping.type);
        controller.importManager.addDecoratorImport(mapping.importDecorator || decoratorName);
      }
    }
  }
  if (operation.parameters) {
    extractParameters(operation.parameters, openapiDoc, controller.importManager).forEach(param => {
      parameters.push(param);
    });
  }
  const requestBody = extractRequestBody(operation.requestBody, openapiDoc);
  const response = extractResponse(operation.responses, openapiDoc);
  const hasParams = parameters.some(param => param.location === 'path');
  const hasQuery = parameters.some(param => param.location === 'query');
  const hasBody = !!requestBody;
  const allParameters = [...parameters, ...(requestBody ? [requestBody] : [])].map(param => ({
    name: param.name,
    type: param.type,
    decorator: param.decorator,
    required: param.required,
    parameterName: param.location === 'path' || param.location === 'query' ? param.name : undefined,
    customDecorators: param.customDecorators,
  }));
  const operationPath = extractOperationPath(path);
  const operationId = operation.operationId;
  if (!operationId) {
    throw new Error(`OperationId not found for ${method.toUpperCase()} ${path}`);
  }
  const customDecorators: DecoratorData[] = [];
  for (const [metadataKey, mapping] of Object.entries(DECORATOR_MAPPING.operationDecorators)) {
    if (operation[metadataKey] !== undefined) {
      const value = operation[metadataKey];
      const args = mapping.argsTransform ? mapping.argsTransform(value).join(', ') : '';
      customDecorators.push({
        name: mapping.decoratorName,
        args,
      });
      controller.importManager.addDecoratorImport(mapping.decoratorName);
    }
  }
  controller.importManager.addTypeImport(response.type);
  allParameters.forEach(param => {
    controller.importManager.addTypeImport(param.type);
  });
  return {
    httpMethod: capitalize(method),
    operationId,
    fullPath: path,
    path: operationPath,
    parameters,
    requestBody,
    responseType: response.type,
    responseStatus: response.status,
    isHttpCodeDifferent: response.status !== getDefaultStatusCode(method),
    hasParams,
    hasQuery,
    hasBody,
    allParameters,
    customDecorators,
  };
}

function extractParameters(
  parameters: (OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)[] | undefined,
  openapiDoc: OpenAPIV3.Document,
  importManager: ImportManager,
): ParameterData[] {
  const params: ParameterData[] = [];
  if (parameters) {
    for (const param of parameters) {
      const resolvedParam = resolveReference(param, openapiDoc);
      const name = resolvedParam.name;
      const location = resolvedParam.in;
      const schema = resolvedParam.schema as OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject;
      const type = getTypeFromSchema(schema, openapiDoc);
      const decorator = getNestDecoratorForParameter({ location });
      const required = resolvedParam.required !== false;
      const paramData: ParameterData = {
        name,
        type,
        location,
        decorator,
        required,
      };
      params.push(paramData);
      if (decorator) {
        importManager.addDecoratorImport(decorator);
      }
    }
  }
  return params;
}

function getNestDecoratorForParameter(param: { location: string }): string {
  switch (param.location) {
    case 'path':
      return 'Param';
    case 'query':
      return 'Query';
    case 'header':
      return 'Headers';
    case 'cookie':
      return 'Cookies';
    default:
      return '';
  }
}

function getDefaultStatusCode(method: string): number {
  switch (method.toLowerCase()) {
    case 'post':
      return 201;
    default:
      return 200;
  }
}

function extractRequestBody(
  requestBody: OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject | undefined,
  openapiDoc: OpenAPIV3.Document,
): RequestBodyData | undefined {
  if (requestBody) {
    const resolvedRequestBody = resolveReference(requestBody, openapiDoc);
    const content = resolvedRequestBody.content && resolvedRequestBody.content['application/json'];
    if (content && content.schema) {
      const schema = content.schema;
      const type = getTypeFromSchema(schema, openapiDoc);
      const required = resolvedRequestBody.required !== false;
      return { name: 'body', type, required, decorator: 'Body' };
    }
  }
  return undefined;
}

function extractResponse(
  responses: OpenAPIV3.ResponsesObject,
  openapiDoc: OpenAPIV3.Document,
): { type: string; status: number } {
  const responseCodes = Object.keys(responses);
  const successResponseCode = responseCodes.find(code => code.startsWith('2')) || '200';
  const responseRef = responses[successResponseCode];
  const response = resolveReference(responseRef, openapiDoc);
  const status = parseInt(successResponseCode, 10);
  let type = 'void';
  if (
    response &&
    response.content &&
    response.content['application/json'] &&
    response.content['application/json'].schema
  ) {
    const schema = response.content['application/json'].schema;
    type = getTypeFromSchema(schema, openapiDoc);
  }
  return { type, status };
}

function getTypeFromSchema(
  schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject | undefined,
  openapiDoc: OpenAPIV3.Document,
): string {
  if (!schema) {
    return 'any';
  }
  if ('$ref' in schema) {
    return extractTypeName(schema['$ref']);
  } else if (schema.type === 'array' && schema.items) {
    const itemType = getTypeFromSchema(schema.items, openapiDoc);
    return `${itemType}[]`;
  } else if (schema.type === 'integer' || schema.type === 'number') {
    return 'number';
  } else if (schema.type === 'string') {
    return 'string';
  } else if (schema.type === 'boolean') {
    return 'boolean';
  } else if (schema.type === 'object') {
    return 'any';
  }
  return 'any';
}

function extractTypeName(ref: string): string {
  return ref.split('/').pop()!;
}

function collectTypeImports(type: string): string[] {
  const cleanType = type
    .replace(/[[\]{}]/g, '')
    .replace(/<[^<>]+>/g, ',')
    .replace(/\s+/g, '');
  const typeNames = cleanType
    .split(',')
    .map(name => name.trim())
    .filter(name => name !== '');
  return typeNames;
}

function renderControllers(controllers: ControllerData[], outputDir: string) {
  const templatePath = './generator/templates/controller.mustache';
  const template = readFileSync(templatePath, 'utf8');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  controllers.forEach(controller => {
    const sortedImports = controller.importManager.getSortedImports();
    const importsForTemplate = sortedImports.map(imp => ({
      importFrom: imp.importFrom,
      names: imp.names.join(', '),
    }));
    const context = {
      ...controller,
      imports: importsForTemplate,
    };
    const output = Mustache.render(template, context);
    const filePath = path.join(outputDir, `${controller.fileName}.controller.ts`);
    writeFileSync(filePath, output);
    console.log(`Generated controller: ${filePath}`);
  });
}

function renderInterfaces(controllers: ControllerData[], outputDir: string) {
  const templatePath = './generator/templates/controller.interface.mustache';
  const template = readFileSync(templatePath, 'utf8');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  controllers.forEach(controller => {
    const importManager = new ImportManager();
    controller.operations.forEach(op => {
      op.allParameters.forEach(param => {
        importManager.addTypeImport(param.type);
      });
      importManager.addTypeImport(op.responseType);
    });
    const sortedImports = importManager.getSortedImports();
    const importsForTemplate = sortedImports.map(imp => ({
      importFrom: imp.importFrom,
      names: imp.names.join(', '),
    }));
    const context = {
      ...controller,
      imports: importsForTemplate,
      operations: controller.operations.map(op => ({
        ...op,
        parameters: [...op.parameters, ...(op.requestBody ? [op.requestBody] : [])],
      })),
    };
    const output = Mustache.render(template, context);
    const filePath = path.join(outputDir, `${controller.fileName}.controller.ts`);
    writeFileSync(filePath, output);
    console.log(`Generated interface: ${filePath}`);
  });
}

function isExternalImport(importFrom: string): boolean {
  return !importFrom.startsWith('.') && !importFrom.startsWith('/');
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function camelCase(str: string): string {
  const pc = pascalCase(str);
  return pc.charAt(0).toLowerCase() + pc.slice(1);
}

function pascalCase(str: string): string {
  return str.replace(/(^\w|[-_\s]\w)/g, match => match.replace(/[-_\s]/, '').toUpperCase());
}

function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function resolveReference<T>(obj: T | OpenAPIV3.ReferenceObject, openapiDoc: OpenAPIV3.Document): T {
  if (isReferenceObject(obj)) {
    const ref = obj.$ref;
    const refPath = ref.replace(/^#\//, '').split('/');
    let current: any = openapiDoc;
    for (const part of refPath) {
      if (current[part] === undefined) {
        throw new Error(`Reference not found: ${ref}`);
      }
      current = current[part];
    }
    return current as T;
  } else {
    return obj;
  }
}

function isReferenceObject(obj: any): obj is OpenAPIV3.ReferenceObject {
  return obj && typeof obj === 'object' && '$ref' in obj;
}

generateControllers();
