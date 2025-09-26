import { useState } from "react";
import { Cloud, User, Circle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AuthSection from "@/components/auth-section-production";
import QuerySection from "@/components/query-section";
import CrudSection from "@/components/crud-section";
import MetadataSection from "@/components/metadata-section";
import DocsSection from "@/components/docs-section";
import BatchSection from "@/components/batch-section";

export default function Dashboard() {
  const [authStatus, setAuthStatus] = useState<'online' | 'offline'>('offline');
  const [authSet, setAuthSet] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState("auth");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="bg-primary p-2 rounded-lg">
                <Cloud className="text-primary-foreground text-xl" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Salesforce MCP Middleware</h1>
                <p className="text-sm text-muted-foreground">Chatbot Integration Server</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">v1.0.0</span>
              <div className="h-8 w-8 bg-accent rounded-full flex items-center justify-center">
                <User className="text-accent-foreground text-sm" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-screen">
        {/* Sidebar Navigation */}
        <aside className="w-64 bg-muted border-r border-border flex-shrink-0">
          <div className="p-6 h-full flex flex-col">
            <div className="space-y-2 flex-1">
              <button 
                onClick={() => setActiveTab("auth")}
                className={`w-full flex items-center justify-start space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeTab === "auth" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-auth"
              >
                <i className="fas fa-key w-4"></i>
                <span>Authentication</span>
              </button>
              <button 
                onClick={() => setActiveTab("query")}
                className={`w-full flex items-center justify-start space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeTab === "query" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-query"
              >
                <i className="fas fa-search w-4"></i>
                <span>Data Query</span>
              </button>
              <button 
                onClick={() => setActiveTab("crud")}
                className={`w-full flex items-center justify-start space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeTab === "crud" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-crud"
              >
                <i className="fas fa-edit w-4"></i>
                <span>CRUD Operations</span>
              </button>
              <button 
                onClick={() => setActiveTab("metadata")}
                className={`w-full flex items-center justify-start space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeTab === "metadata" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-metadata"
              >
                <i className="fas fa-database w-4"></i>
                <span>Metadata</span>
              </button>
              <button 
                onClick={() => setActiveTab("batch")}
                className={`w-full flex items-center justify-start space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeTab === "batch" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-batch"
              >
                <i className="fas fa-layer-group w-4"></i>
                <span>Batch Processing</span>
              </button>
              <button 
                onClick={() => setActiveTab("docs")}
                className={`w-full flex items-center justify-start space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeTab === "docs" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-docs"
              >
                <i className="fas fa-book w-4"></i>
                <span>Documentation</span>
              </button>
            </div>

            <div className="mt-8 p-4 bg-accent rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <i className="fas fa-info-circle text-accent-foreground"></i>
                <span className="text-sm font-medium text-accent-foreground">Status</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-accent-foreground">Server</span>
                  <span className="text-green-400 flex items-center gap-1">
                    <Circle className="h-2 w-2 fill-current" />
                    Online
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-accent-foreground">Auth</span>
                  <span className={`flex items-center gap-1 ${authSet ? 'text-green-400' : 'text-red-400'}`}>
                    <Circle className="h-2 w-2 fill-current" />
                    {authSet ? 'Set' : 'Not Set'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-8 h-full">
            {activeTab === "auth" && <AuthSection onAuthChange={setAuthSet} />}
            {activeTab === "query" && <QuerySection />}
            {activeTab === "crud" && <CrudSection />}
            {activeTab === "metadata" && <MetadataSection />}
            {activeTab === "batch" && <BatchSection />}
            {activeTab === "docs" && <DocsSection />}
          </div>
        </main>
      </div>
    </div>
  );
}
