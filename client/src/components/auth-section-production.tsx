import { useState, useEffect } from "react";
import { Shield, Check, Settings, ExternalLink, RefreshCw, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface AuthSectionProps {
  onAuthChange: (isAuthenticated: boolean) => void;
}

export default function AuthSectionProduction({ onAuthChange }: AuthSectionProps) {
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [oauthConfig, setOauthConfig] = useState({ clientId: "", clientSecret: "", instanceUrl: "" });
  const [oauthStatus, setOauthStatus] = useState<'unconfigured' | 'configured' | 'authorized'>('unconfigured');
  const [isLoading, setIsLoading] = useState(false);
  
  const auth = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    onAuthChange(auth.isAuthenticated);
  }, [auth.isAuthenticated, onAuthChange]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.username || !loginForm.password) {
      toast({
        title: "Missing Information",
        description: "Please provide both username and password",
        variant: "destructive"
      });
      return;
    }

    auth.login(loginForm, {
      onSuccess: (result) => {
        if (result.success) {
          toast({
            title: "Login Successful",
            description: `Welcome, ${result.user?.username}!`
          });
          setLoginForm({ username: "", password: "" });
        } else {
          toast({
            title: "Login Failed",
            description: result.message,
            variant: "destructive"
          });
        }
      },
      onError: (error) => {
        toast({
          title: "Login Failed",
          description: error?.message || "Authentication failed",
          variant: "destructive"
        });
      }
    });
  };

  const configureOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oauthConfig.clientId || !oauthConfig.clientSecret || !oauthConfig.instanceUrl) {
      toast({
        title: "Missing Configuration",
        description: "Please provide all OAuth fields",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const csrfResponse = await fetch('/api/auth/csrf-token', {
        credentials: 'include'
      });
      const csrfData = await csrfResponse.json();
      
      const response = await fetch('/api/oauth/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.csrf_token
        },
        credentials: 'include',
        body: JSON.stringify(oauthConfig)
      });

      const result = await response.json();
      
      if (result.success) {
        setOauthStatus('configured');
        toast({
          title: "OAuth Configured",
          description: "Ready to authorize with Salesforce"
        });
      } else {
        throw new Error(result.error || 'Configuration failed');
      }
    } catch (error: any) {
      toast({
        title: "Configuration Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const authorizeWithSalesforce = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/oauth/authorize-url', {
        method: 'GET',
        credentials: 'include'
      });

      const result = await response.json();
      
      if (result.authUrl) {
        window.open(result.authUrl, '_blank', 'noopener,noreferrer');
        toast({
          title: "Authorization Started",
          description: "Complete authorization in the new window",
          variant: "default"
        });
      } else {
        throw new Error(result.error || 'Failed to generate authorization URL');
      }
    } catch (error: any) {
      toast({
        title: "Authorization Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Admin Interface for Authenticated Users
  if (auth.isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Salesforce MCP Middleware</h2>
          <p className="text-muted-foreground">Configure Salesforce integration for your chatbot</p>
        </div>

        {/* Quick Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <Shield className="mr-2 h-5 w-5" />
                System Status
              </span>
              <Button 
                onClick={() => auth.logout()}
                variant="outline" 
                size="sm"
                data-testid="button-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium">Admin User</p>
                <p className="text-muted-foreground">{auth.user?.username}</p>
              </div>
              <div>
                <p className="font-medium">OAuth Status</p>
                <p className={`font-medium ${oauthStatus === 'authorized' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {oauthStatus === 'authorized' ? 'Ready' : 'Configuration Required'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Server-Managed Authentication */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="mr-2 h-5 w-5" />
              Salesforce Authentication Setup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center space-x-2 text-green-700 dark:text-green-400 mb-2">
                  <Check className="h-5 w-5" />
                  <p className="font-medium">Server-Managed Authentication</p>
                </div>
                <p className="text-sm text-green-600 dark:text-green-300">
                  No browser OAuth required! Server handles all Salesforce authentication internally.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Username/Password OAuth Authentication (Active)</h4>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Current server authentication configuration:</p>
                  <div className="bg-muted p-3 rounded text-xs font-mono space-y-1">
                    <div>SF_OAUTH_CLIENT_ID=your_connected_app_consumer_key</div>
                    <div>SF_OAUTH_CLIENT_SECRET=your_connected_app_consumer_secret</div>
                    <div>SF_USERNAME=your_salesforce_username</div>
                    <div>SF_PASSWORD=your_password_plus_security_token</div>
                    <div>SF_LOGIN_URL=https://login.salesforce.com</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Chatbot API Endpoints</h4>
                <div className="bg-muted p-3 rounded text-xs space-y-2">
                  <div><strong>SOQL Query:</strong> POST /api/chatbot/query</div>
                  <div><strong>Object Metadata:</strong> POST /api/chatbot/describe</div>
                  <div><strong>Create Record:</strong> POST /api/chatbot/record</div>
                  <div><strong>Update Record:</strong> PATCH /api/chatbot/record</div>
                  <div><strong>Search:</strong> POST /api/chatbot/search</div>
                </div>
                <p className="text-xs text-muted-foreground">
                  All endpoints use API key authentication. No Salesforce tokens required from clients.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-600 dark:text-blue-300">
                  <strong>Benefits:</strong> No cross-domain issues, no browser popups, more secure, easier integration.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Login Interface
  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-semibold mb-2">Admin Login</h2>
        <p className="text-muted-foreground">Access Salesforce MCP middleware administration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <User className="mr-2 h-5 w-5" />
            Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                type="text"
                placeholder="Admin username"
                value={loginForm.username}
                onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
                data-testid="input-username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="Admin password"
                value={loginForm.password}
                onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                data-testid="input-password"
                required
              />
            </div>
            <Button 
              type="submit"
              disabled={auth.loginIsLoading}
              className="w-full"
              data-testid="button-login"
            >
              {auth.loginIsLoading ? "Logging in..." : "Login"}
            </Button>
          </form>
          
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-md">
            <p className="text-xs text-muted-foreground">
              <strong>First-time setup:</strong> Create admin account via environment variables or database initialization.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}