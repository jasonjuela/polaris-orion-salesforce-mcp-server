import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Upload, Play, Eye, RefreshCw, FileText, Package } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface BulkJob {
  jobId: string;
  state: string;
  object: string;
  operation: string;
  createdDate: string;
  numberRecordsProcessed?: number;
  numberRecordsFailed?: number;
}

export default function BatchSection() {
  const [isLoading, setIsLoading] = useState(false);
  const [bulkJobs, setBulkJobs] = useState<BulkJob[]>([]);
  const { toast } = useToast();

  // Form states for different operations
  const [bulkJobForm, setBulkJobForm] = useState({
    object_name: "",
    operation: "insert",
    external_id_field: ""
  });

  const [batchData, setBatchData] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [bulkQuerySoql, setBulkQuerySoql] = useState("");
  const [queryJobId, setQueryJobId] = useState("");

  const checkAuthStatus = async () => {
    // Server-managed authentication - no client auth check needed
    // Server handles Salesforce authentication internally
    return true;
  };

  const createBulkJob = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) return;

    if (!bulkJobForm.object_name || !bulkJobForm.operation) {
      toast({
        title: "Missing Information",
        description: "Please provide object name and operation type.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/createBulkJob', {
        object_name: bulkJobForm.object_name,
        operation: bulkJobForm.operation,
        external_id_field: bulkJobForm.external_id_field || undefined
      });

      const result = await response.json();
      
      if (response.ok) {
        setBulkJobs(prev => [...prev, result]);
        setSelectedJobId(result.jobId);
        toast({
          title: "Bulk Job Created",
          description: `Job ${result.jobId} created successfully for ${result.operation} on ${result.object}.`,
        });
      } else {
        toast({
          title: "Job Creation Failed",
          description: result.error || "Failed to create bulk job",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create bulk job. Please check your connection.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addBatchToJob = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated || !selectedJobId || !batchData.trim()) return;

    try {
      const records = JSON.parse(batchData);
      if (!Array.isArray(records)) {
        throw new Error("Data must be an array of records");
      }

      setIsLoading(true);
      const response = await apiRequest('POST', '/api/addBatchToBulkJob', {
        job_id: selectedJobId,
        records: records
      });

      const result = await response.json();
      
      if (response.ok) {
        toast({
          title: "Batch Added",
          description: `Added ${result.recordCount} records to job ${selectedJobId}.`,
        });
      } else {
        toast({
          title: "Batch Upload Failed",
          description: result.error || "Failed to add batch to job",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Invalid Data Format",
        description: "Please provide valid JSON array of records.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const closeBulkJob = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated || !selectedJobId) return;

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/closeBulkJob', {
        job_id: selectedJobId
      });

      const result = await response.json();
      
      if (response.ok) {
        setBulkJobs(prev => prev.map(job => 
          job.jobId === selectedJobId ? { ...job, state: result.state } : job
        ));
        toast({
          title: "Job Closed",
          description: `Job ${selectedJobId} has been closed for processing.`,
        });
      } else {
        toast({
          title: "Job Closure Failed",
          description: result.error || "Failed to close bulk job",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to close bulk job. Please check your connection.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getBulkJobStatus = async (jobId: string) => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated) return;

    try {
      const response = await apiRequest('POST', '/api/getBulkJobStatus', {
        job_id: jobId
      });

      const result = await response.json();
      
      if (response.ok) {
        setBulkJobs(prev => prev.map(job => 
          job.jobId === jobId ? { ...job, ...result } : job
        ));
        toast({
          title: "Status Updated",
          description: `Job ${jobId} status: ${result.state}`,
        });
      } else {
        toast({
          title: "Status Check Failed",
          description: result.error || "Failed to get job status",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get job status. Please check your connection.",
        variant: "destructive",
      });
    }
  };

  const executeBulkQuery = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated || !bulkQuerySoql.trim()) return;

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/executeBulkQuery', {
        soql: bulkQuerySoql
      });

      const result = await response.json();
      
      if (response.ok) {
        setQueryJobId(result.jobId);
        toast({
          title: "Bulk Query Started",
          description: `Query job ${result.jobId} has been created.`,
        });
      } else {
        toast({
          title: "Query Failed",
          description: result.error || "Failed to execute bulk query",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to execute bulk query. Please check your connection.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getBulkQueryResults = async () => {
    const isAuthenticated = await checkAuthStatus();
    if (!isAuthenticated || !queryJobId) return;

    try {
      const response = await apiRequest('POST', '/api/getBulkQueryResults', {
        job_id: queryJobId
      });

      const result = await response.json();
      
      if (response.ok) {
        toast({
          title: "Query Results Retrieved",
          description: `Retrieved ${result.results?.length || 0} records.`,
        });
        // You can display the results here or download them
        console.log('Bulk query results:', result.results);
      } else {
        toast({
          title: "Results Retrieval Failed",
          description: result.error || "Failed to get query results",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get query results. Please check your connection.",
        variant: "destructive",
      });
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'Open': return 'bg-blue-100 text-blue-800';
      case 'UploadComplete': return 'bg-yellow-100 text-yellow-800';
      case 'InProgress': return 'bg-purple-100 text-purple-800';
      case 'JobComplete': return 'bg-green-100 text-green-800';
      case 'Failed': return 'bg-red-100 text-red-800';
      case 'Aborted': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Batch Processing</h2>
        <p className="text-muted-foreground mt-2">
          Process large datasets efficiently using Salesforce Bulk API 2.0
        </p>
      </div>

      <Tabs defaultValue="bulk-crud" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="bulk-crud" data-testid="tab-bulk-crud">
            <Package className="w-4 h-4 mr-2" />
            Bulk CRUD
          </TabsTrigger>
          <TabsTrigger value="bulk-query" data-testid="tab-bulk-query">
            <FileText className="w-4 h-4 mr-2" />
            Bulk Query
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bulk-crud" className="space-y-6">
          {/* Create Bulk Job */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Create Bulk Job
              </CardTitle>
              <CardDescription>
                Create a new bulk job for insert, update, upsert, or delete operations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bulk-object-name">Object Name</Label>
                  <Input
                    id="bulk-object-name"
                    data-testid="input-bulk-object-name"
                    placeholder="e.g., Account, Contact"
                    value={bulkJobForm.object_name}
                    onChange={(e) => setBulkJobForm(prev => ({ ...prev, object_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bulk-operation">Operation</Label>
                  <Select
                    value={bulkJobForm.operation}
                    onValueChange={(value) => setBulkJobForm(prev => ({ ...prev, operation: value }))}
                  >
                    <SelectTrigger data-testid="select-bulk-operation">
                      <SelectValue placeholder="Select operation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="insert">Insert</SelectItem>
                      <SelectItem value="update">Update</SelectItem>
                      <SelectItem value="upsert">Upsert</SelectItem>
                      <SelectItem value="delete">Delete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {bulkJobForm.operation === 'upsert' && (
                <div className="space-y-2">
                  <Label htmlFor="external-id-field">External ID Field</Label>
                  <Input
                    id="external-id-field"
                    data-testid="input-external-id-field"
                    placeholder="e.g., External_Id__c"
                    value={bulkJobForm.external_id_field}
                    onChange={(e) => setBulkJobForm(prev => ({ ...prev, external_id_field: e.target.value }))}
                  />
                </div>
              )}
              <Button
                onClick={createBulkJob}
                disabled={isLoading}
                className="w-full"
                data-testid="button-create-bulk-job"
              >
                {isLoading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Create Bulk Job
              </Button>
            </CardContent>
          </Card>

          {/* Add Batch Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Add Batch Data
              </CardTitle>
              <CardDescription>
                Upload data to an existing bulk job (JSON format)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="job-selection">Select Job</Label>
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger data-testid="select-job-id">
                    <SelectValue placeholder="Select a job" />
                  </SelectTrigger>
                  <SelectContent>
                    {bulkJobs.map((job) => (
                      <SelectItem key={job.jobId} value={job.jobId}>
                        {job.jobId} - {job.operation} on {job.object}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-data">Batch Data (JSON Array)</Label>
                <Textarea
                  id="batch-data"
                  data-testid="textarea-batch-data"
                  placeholder='[{"Name": "Test Account", "Type": "Customer"}, {"Name": "Test Account 2", "Type": "Partner"}]'
                  value={batchData}
                  onChange={(e) => setBatchData(e.target.value)}
                  rows={8}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={addBatchToJob}
                  disabled={isLoading || !selectedJobId}
                  className="flex-1"
                  data-testid="button-add-batch"
                >
                  {isLoading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  Add Batch
                </Button>
                <Button
                  onClick={closeBulkJob}
                  disabled={isLoading || !selectedJobId}
                  variant="outline"
                  data-testid="button-close-job"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Close & Process
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulk-query" className="space-y-6">
          {/* Bulk Query */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Bulk Query
              </CardTitle>
              <CardDescription>
                Execute large SOQL queries asynchronously
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bulk-query-soql">SOQL Query</Label>
                <Textarea
                  id="bulk-query-soql"
                  data-testid="textarea-bulk-query-soql"
                  placeholder="SELECT Id, Name, Type FROM Account WHERE CreatedDate = THIS_YEAR"
                  value={bulkQuerySoql}
                  onChange={(e) => setBulkQuerySoql(e.target.value)}
                  rows={4}
                />
              </div>
              <Button
                onClick={executeBulkQuery}
                disabled={isLoading || !bulkQuerySoql.trim()}
                className="w-full"
                data-testid="button-execute-bulk-query"
              >
                {isLoading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Execute Bulk Query
              </Button>
              
              {queryJobId && (
                <div className="p-4 bg-accent rounded-lg">
                  <p className="text-sm font-medium mb-2">Query Job Created</p>
                  <p className="text-sm text-muted-foreground mb-3">Job ID: {queryJobId}</p>
                  <Button
                    onClick={getBulkQueryResults}
                    variant="outline"
                    size="sm"
                    data-testid="button-get-query-results"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Get Results
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bulk Jobs Status */}
      {bulkJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Job Status
            </CardTitle>
            <CardDescription>
              Monitor your bulk jobs progress
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bulkJobs.map((job) => (
                <div key={job.jobId} className="flex items-center justify-between p-3 bg-accent rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{job.jobId}</span>
                      <Badge className={getStateColor(job.state)}>{job.state}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {job.operation} on {job.object} • Created: {new Date(job.createdDate).toLocaleString()}
                    </p>
                    {job.numberRecordsProcessed !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        Processed: {job.numberRecordsProcessed} • Failed: {job.numberRecordsFailed || 0}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => getBulkJobStatus(job.jobId)}
                    variant="outline"
                    size="sm"
                    data-testid={`button-refresh-status-${job.jobId}`}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}