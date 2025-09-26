import { useState } from "react";
import { Plus, Edit, Trash, RefreshCw, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function CrudSection() {
  const [createObject, setCreateObject] = useState("Account");
  const [createFields, setCreateFields] = useState('{"Name": "Test Account", "Type": "Customer"}');
  const [updateObject, setUpdateObject] = useState("Account");
  const [updateId, setUpdateId] = useState("");
  const [updateFields, setUpdateFields] = useState('{"Name": "Updated Account"}');
  const [deleteObject, setDeleteObject] = useState("Account");
  const [deleteId, setDeleteId] = useState("");
  const [upsertObject, setUpsertObject] = useState("Account");
  const [upsertField, setUpsertField] = useState("External_ID__c");
  const [upsertValue, setUpsertValue] = useState("EXT123");
  const [upsertFields, setUpsertFields] = useState('{"Name": "Upsert Account"}');
  const [crudResults, setCrudResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const checkAuthStatus = async () => {
    // Server-managed authentication - no client auth check needed
    // Server handles Salesforce authentication internally
    return true;
  };

  const createRecord = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const fields = JSON.parse(createFields);
      const response = await apiRequest('POST', '/api/chatbot/record', {
        object_name: createObject,
        data: fields
      });
      const result = await response.json();
      setCrudResults(result);
      toast({
        title: "Record Created",
        description: `Successfully created record with ID: ${result.id}`
      });
    } catch (error: any) {
      toast({
        title: "Create Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateRecord = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const fields = JSON.parse(updateFields);
      const response = await apiRequest('PATCH', '/api/chatbot/record', {
        object_name: updateObject,
        record_id: updateId,
        data: fields
      });
      const result = await response.json();
      setCrudResults(result);
      toast({
        title: "Record Updated",
        description: `Successfully updated record ${updateId}`
      });
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteRecord = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const response = await apiRequest('DELETE', '/api/chatbot/record', {
        object_name: deleteObject,
        record_id: deleteId
      });
      const result = await response.json();
      setCrudResults(result);
      toast({
        title: "Record Deleted",
        description: `Successfully deleted record ${deleteId}`
      });
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const upsertRecord = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const fields = JSON.parse(upsertFields);
      const response = await apiRequest('POST', '/api/chatbot/record', {
        object_name: upsertObject,
        external_id_field: upsertField,
        external_id_value: upsertValue,
        data: fields
      });
      const result = await response.json();
      setCrudResults(result);
      toast({
        title: "Record Upserted",
        description: `Successfully upserted record with ID: ${result.id}`
      });
    } catch (error: any) {
      toast({
        title: "Upsert Failed",
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
        <h2 className="text-2xl font-semibold mb-2">CRUD Operations</h2>
        <p className="text-muted-foreground">Create, read, update, and delete Salesforce records.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create Record */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Plus className="text-green-400 mr-2" />
              Create Record
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create_object">Object Name</Label>
              <Input
                id="create_object"
                value={createObject}
                onChange={(e) => setCreateObject(e.target.value)}
                placeholder="Account"
                data-testid="input-create-object"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create_fields">Field Data (JSON)</Label>
              <Textarea
                id="create_fields"
                rows={4}
                className="font-mono"
                value={createFields}
                onChange={(e) => setCreateFields(e.target.value)}
                placeholder='{"Name": "Test Account", "Type": "Customer"}'
                data-testid="textarea-create-fields"
              />
            </div>
            <Button 
              onClick={createRecord} 
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700"
              data-testid="button-create-record"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Record
            </Button>
          </CardContent>
        </Card>

        {/* Update Record */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Edit className="text-blue-400 mr-2" />
              Update Record
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="update_object">Object Name</Label>
              <Input
                id="update_object"
                value={updateObject}
                onChange={(e) => setUpdateObject(e.target.value)}
                placeholder="Account"
                data-testid="input-update-object"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="update_id">Record ID</Label>
              <Input
                id="update_id"
                value={updateId}
                onChange={(e) => setUpdateId(e.target.value)}
                placeholder="001XX0000000000"
                data-testid="input-update-id"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="update_fields">Update Fields (JSON)</Label>
              <Textarea
                id="update_fields"
                rows={3}
                className="font-mono"
                value={updateFields}
                onChange={(e) => setUpdateFields(e.target.value)}
                placeholder='{"Name": "Updated Account"}'
                data-testid="textarea-update-fields"
              />
            </div>
            <Button 
              onClick={updateRecord} 
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700"
              data-testid="button-update-record"
            >
              <Edit className="mr-2 h-4 w-4" />
              Update Record
            </Button>
          </CardContent>
        </Card>

        {/* Delete Record */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Trash className="text-red-400 mr-2" />
              Delete Record
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete_object">Object Name</Label>
              <Input
                id="delete_object"
                value={deleteObject}
                onChange={(e) => setDeleteObject(e.target.value)}
                placeholder="Account"
                data-testid="input-delete-object"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete_id">Record ID</Label>
              <Input
                id="delete_id"
                value={deleteId}
                onChange={(e) => setDeleteId(e.target.value)}
                placeholder="001XX0000000000"
                data-testid="input-delete-id"
              />
            </div>
            <Button 
              onClick={deleteRecord} 
              disabled={isLoading}
              className="w-full bg-red-600 hover:bg-red-700"
              data-testid="button-delete-record"
            >
              <Trash className="mr-2 h-4 w-4" />
              Delete Record
            </Button>
          </CardContent>
        </Card>

        {/* Upsert Record */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <RefreshCw className="text-orange-400 mr-2" />
              Upsert Record
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="upsert_object">Object Name</Label>
              <Input
                id="upsert_object"
                value={upsertObject}
                onChange={(e) => setUpsertObject(e.target.value)}
                placeholder="Account"
                data-testid="input-upsert-object"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="upsert_field">External ID Field</Label>
                <Input
                  id="upsert_field"
                  value={upsertField}
                  onChange={(e) => setUpsertField(e.target.value)}
                  placeholder="External_ID__c"
                  data-testid="input-upsert-field"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="upsert_value">External ID Value</Label>
                <Input
                  id="upsert_value"
                  value={upsertValue}
                  onChange={(e) => setUpsertValue(e.target.value)}
                  placeholder="EXT123"
                  data-testid="input-upsert-value"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upsert_fields">Field Data (JSON)</Label>
              <Textarea
                id="upsert_fields"
                rows={3}
                className="font-mono"
                value={upsertFields}
                onChange={(e) => setUpsertFields(e.target.value)}
                placeholder='{"Name": "Upsert Account"}'
                data-testid="textarea-upsert-fields"
              />
            </div>
            <Button 
              onClick={upsertRecord} 
              disabled={isLoading}
              className="w-full bg-orange-600 hover:bg-orange-700"
              data-testid="button-upsert-record"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Upsert Record
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Results Section */}
      <Card className="mt-8 bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Terminal className="text-gray-400 mr-2" />
            Operation Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-md max-h-96 overflow-auto">
            <pre className="text-sm font-mono" data-testid="text-crud-results">
              {crudResults ? JSON.stringify(crudResults, null, 2) : "Operation results will appear here..."}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
