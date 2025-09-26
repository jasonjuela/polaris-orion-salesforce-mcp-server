import { useState } from "react";
import { Network, List, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function MetadataSection() {
  const [schemaObject, setSchemaObject] = useState("Account");
  const [schemaResults, setSchemaResults] = useState<any>(null);
  const [picklistObject, setPicklistObject] = useState("Account");
  const [picklistField, setPicklistField] = useState("Type");
  const [picklistResults, setPicklistResults] = useState<any>(null);
  const [allSchemasResults, setAllSchemasResults] = useState<any>(null);
  const [includeCustom, setIncludeCustom] = useState(true);
  const [schemaLimit, setSchemaLimit] = useState("50");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const checkAuthStatus = async () => {
    // Server-managed authentication - no client auth check needed
    // Server handles Salesforce authentication internally
    return true;
  };

  const getObjectSchema = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/chatbot/describe', {
        object_name: schemaObject
      });
      const result = await response.json();
      setSchemaResults(result);
      toast({
        title: "Schema Retrieved",
        description: `Found ${result.fields.length} fields for ${schemaObject}`
      });
    } catch (error: any) {
      toast({
        title: "Schema Retrieval Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getPicklistValues = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/chatbot/picklist', {
        object_name: picklistObject,
        field_name: picklistField
      });
      const result = await response.json();
      setPicklistResults(result);
      toast({
        title: "Picklist Values Retrieved",
        description: `Found ${result.values.length} values for ${picklistField}`
      });
    } catch (error: any) {
      toast({
        title: "Picklist Retrieval Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getAllObjectSchemas = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/chatbot/getAllObjectSchemas', {
        include_custom: includeCustom,
        limit: parseInt(schemaLimit) || 50
      });
      const result = await response.json();
      setAllSchemasResults(result);
      toast({
        title: "All Schemas Retrieved",
        description: `Retrieved ${result.successfulSchemas || result.schemas?.length || 0} schemas`
      });
    } catch (error: any) {
      toast({
        title: "Schema Retrieval Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">Metadata Tools</h2>
        <p className="text-muted-foreground">Explore object schemas, field definitions, and picklist values.</p>
      </div>

      <div className="space-y-8">
        {/* Object Schema Tool */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Network className="text-blue-400 mr-2" />
              Object Schema Explorer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="schema_object">Object Name</Label>
                  <Input
                    id="schema_object"
                    value={schemaObject}
                    onChange={(e) => setSchemaObject(e.target.value)}
                    placeholder="Account"
                    data-testid="input-schema-object"
                  />
                </div>
                <Button 
                  onClick={getObjectSchema} 
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  data-testid="button-get-schema"
                >
                  <Network className="mr-2 h-4 w-4" />
                  Get Schema
                </Button>
              </div>
              <div>
                <Label>Schema Details</Label>
                <div className="bg-muted p-4 rounded-md mt-2 max-h-96 overflow-auto">
                  <pre className="text-sm font-mono" data-testid="text-schema-results">
                    {schemaResults ? JSON.stringify(schemaResults, null, 2) : "Schema will appear here..."}
                  </pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Get All Object Schemas Tool */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="text-purple-400 mr-2" />
              All Object Schemas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="schema_limit">Number of Objects (max)</Label>
                  <Input
                    id="schema_limit"
                    value={schemaLimit}
                    onChange={(e) => setSchemaLimit(e.target.value)}
                    placeholder="50"
                    type="number"
                    min="1"
                    max="200"
                    data-testid="input-schema-limit"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include_custom"
                    checked={includeCustom}
                    onCheckedChange={(checked) => setIncludeCustom(checked as boolean)}
                    data-testid="checkbox-include-custom"
                  />
                  <Label htmlFor="include_custom">Include Custom Objects</Label>
                </div>
                <Button 
                  onClick={getAllObjectSchemas} 
                  disabled={isLoading}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  data-testid="button-get-all-schemas"
                >
                  <Database className="mr-2 h-4 w-4" />
                  {isLoading ? "Fetching..." : "Get All Schemas"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  This may take a moment as it fetches multiple schemas sequentially.
                </p>
              </div>
              <div>
                <Label>All Schemas Results</Label>
                <div className="bg-muted p-4 rounded-md mt-2 max-h-96 overflow-auto">
                  <pre className="text-sm font-mono" data-testid="text-all-schemas-results">
                    {allSchemasResults ? JSON.stringify(allSchemasResults, null, 2) : "All schemas will appear here..."}
                  </pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Picklist Values Tool */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <List className="text-green-400 mr-2" />
              Picklist Values
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="picklist_object">Object Name</Label>
                  <Input
                    id="picklist_object"
                    value={picklistObject}
                    onChange={(e) => setPicklistObject(e.target.value)}
                    placeholder="Account"
                    data-testid="input-picklist-object"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="picklist_field">Field Name</Label>
                  <Input
                    id="picklist_field"
                    value={picklistField}
                    onChange={(e) => setPicklistField(e.target.value)}
                    placeholder="Type"
                    data-testid="input-picklist-field"
                  />
                </div>
                <Button 
                  onClick={getPicklistValues} 
                  disabled={isLoading}
                  className="w-full bg-green-600 hover:bg-green-700"
                  data-testid="button-get-picklist"
                >
                  <List className="mr-2 h-4 w-4" />
                  Get Values
                </Button>
              </div>
              <div>
                <Label>Picklist Values</Label>
                <div className="bg-muted p-4 rounded-md mt-2 max-h-96 overflow-auto">
                  <pre className="text-sm font-mono" data-testid="text-picklist-results">
                    {picklistResults ? JSON.stringify(picklistResults, null, 2) : "Values will appear here..."}
                  </pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
