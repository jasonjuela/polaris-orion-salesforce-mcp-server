import { apiRequest } from "./queryClient";

export interface SalesforceAuth {
  access_token: string;
  instance_url: string;
}

export class SalesforceApi {
  static async runSOQLQuery(auth: SalesforceAuth, soql: string) {
    const response = await apiRequest('POST', '/api/runSOQLQuery', {
      ...auth,
      soql
    });
    return response.json();
  }

  static async getObjectSchema(auth: SalesforceAuth, objectName: string) {
    const response = await apiRequest('POST', '/api/getObjectSchema', {
      ...auth,
      object_name: objectName
    });
    return response.json();
  }

  static async searchObjects(auth: SalesforceAuth, searchTerm: string) {
    const response = await apiRequest('POST', '/api/searchObjects', {
      ...auth,
      search_term: searchTerm
    });
    return response.json();
  }

  static async runSOSLQuery(auth: SalesforceAuth, searchTerm: string, objects: string[]) {
    const response = await apiRequest('POST', '/api/runSOSLQuery', {
      ...auth,
      search_term: searchTerm,
      objects
    });
    return response.json();
  }

  static async getPicklistValues(auth: SalesforceAuth, objectName: string, fieldName: string) {
    const response = await apiRequest('POST', '/api/getPicklistValues', {
      ...auth,
      object_name: objectName,
      field_name: fieldName
    });
    return response.json();
  }

  static async createRecord(auth: SalesforceAuth, objectName: string, fields: any) {
    const response = await apiRequest('POST', '/api/createRecord', {
      ...auth,
      object_name: objectName,
      fields
    });
    return response.json();
  }

  static async updateRecord(auth: SalesforceAuth, objectName: string, recordId: string, fields: any) {
    const response = await apiRequest('POST', '/api/updateRecord', {
      ...auth,
      object_name: objectName,
      record_id: recordId,
      fields
    });
    return response.json();
  }

  static async deleteRecord(auth: SalesforceAuth, objectName: string, recordId: string) {
    const response = await apiRequest('POST', '/api/deleteRecord', {
      ...auth,
      object_name: objectName,
      record_id: recordId
    });
    return response.json();
  }

  static async upsertRecord(auth: SalesforceAuth, objectName: string, externalIdField: string, externalIdValue: string, fields: any) {
    const response = await apiRequest('POST', '/api/upsertRecord', {
      ...auth,
      object_name: objectName,
      external_id_field: externalIdField,
      external_id_value: externalIdValue,
      fields
    });
    return response.json();
  }
}
