import { useState } from "react";
import { Play, Search, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function QuerySection() {
  const [soqlQuery, setSoqlQuery] = useState("SELECT Id, Name FROM Account LIMIT 10");
  const [soqlResults, setSoqlResults] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchObjects, setSearchObjects] = useState("Account,Contact,Lead");
  const [soslResults, setSoslResults] = useState<any>(null);
  const [objectSearch, setObjectSearch] = useState("");
  const [objectResults, setObjectResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const checkAuthStatus = async () => {
    // Server-managed authentication - no client auth check needed
    // Server handles Salesforce authentication internally
    return true;
  };

  const executeSOQL = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/chatbot/query', {
        query: soqlQuery
      });
      const result = await response.json();
      setSoqlResults(result);
      toast({
        title: "Query Executed",
        description: `Found ${result.totalSize} records`
      });
    } catch (error: any) {
      toast({
        title: "Query Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const executeSOSL = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/chatbot/search', {
        query: `FIND {${searchTerm}} IN ALL FIELDS RETURNING ${searchObjects.split(',').map(obj => obj.trim()).join(',')}`
      });
      const result = await response.json();
      setSoslResults(result);
      toast({
        title: "Search Completed",
        description: `Found ${result.searchRecords?.length || 0} results`
      });
    } catch (error: any) {
      toast({
        title: "Search Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const searchObjectsFunction = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) return;

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/chatbot/searchObjects', {
        search_term: objectSearch
      });
      const result = await response.json();
      setObjectResults(result);
      toast({
        title: "Objects Found",
        description: `Found ${result.objects?.length || 0} matching objects`
      });
    } catch (error: any) {
      toast({
        title: "Search Failed",
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
        <h2 className="text-2xl font-semibold mb-2">Data Query Tools</h2>
        <p className="text-muted-foreground">Execute SOQL/SOSL queries and search across Salesforce objects.</p>
      </div>

      <div className="space-y-8">
        {/* SOQL Query Tool */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <i className="fas fa-code text-green-400 mr-2"></i>
              SOQL Query Executor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="soql_query">SOQL Query</Label>
                  <Textarea
                    id="soql_query"
                    rows={6}
                    className="font-mono"
                    value={soqlQuery}
                    onChange={(e) => setSoqlQuery(e.target.value)}
                    placeholder="SELECT Id, Name FROM Account LIMIT 10"
                    data-testid="textarea-soql-query"
                  />
                </div>
                <Button 
                  onClick={executeSOQL} 
                  disabled={isLoading}
                  className="w-full bg-green-600 hover:bg-green-700"
                  data-testid="button-execute-soql"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Execute Query
                </Button>
              </div>
              <div>
                <Label>Query Results</Label>
                <div className="bg-muted p-4 rounded-md mt-2 max-h-96 overflow-auto">
                  <pre className="text-sm font-mono" data-testid="text-soql-results">
                    {soqlResults ? JSON.stringify(soqlResults, null, 2) : "Results will appear here..."}
                  </pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SOSL Search Tool */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Search className="text-blue-400 mr-2" />
              SOSL Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="search_term">Search Term</Label>
                  <Input
                    id="search_term"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Enter search term"
                    data-testid="input-search-term"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="search_objects">Objects to Search</Label>
                  <Input
                    id="search_objects"
                    value={searchObjects}
                    onChange={(e) => setSearchObjects(e.target.value)}
                    placeholder="Account,Contact,Lead (comma-separated)"
                    data-testid="input-search-objects"
                  />
                </div>
                <Button 
                  onClick={executeSOSL} 
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  data-testid="button-execute-sosl"
                >
                  <Search className="mr-2 h-4 w-4" />
                  Search Objects
                </Button>
              </div>
              <div>
                <Label>Search Results</Label>
                <div className="bg-muted p-4 rounded-md mt-2 max-h-96 overflow-auto">
                  <pre className="text-sm font-mono" data-testid="text-sosl-results">
                    {soslResults ? JSON.stringify(soslResults, null, 2) : "Results will appear here..."}
                  </pre>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Object Search Tool */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <List className="text-purple-400 mr-2" />
              Object Discovery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="object_search">Search Objects</Label>
                  <Input
                    id="object_search"
                    value={objectSearch}
                    onChange={(e) => setObjectSearch(e.target.value)}
                    placeholder="account, contact, custom object..."
                    data-testid="input-object-search"
                  />
                </div>
                <Button 
                  onClick={searchObjectsFunction} 
                  disabled={isLoading}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  data-testid="button-search-objects"
                >
                  <Search className="mr-2 h-4 w-4" />
                  Find Objects
                </Button>
              </div>
              <div>
                <Label>Found Objects</Label>
                <div className="bg-muted p-4 rounded-md mt-2 max-h-96 overflow-auto">
                  <pre className="text-sm font-mono" data-testid="text-object-results">
                    {objectResults ? JSON.stringify(objectResults, null, 2) : "Results will appear here..."}
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
