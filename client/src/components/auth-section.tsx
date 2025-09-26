import { useState, useEffect } from "react";
import { Shield, Check, Info, LogOut, UserPlus, User, Settings, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface AuthSectionProps {
  onAuthChange: (isAuthenticated: boolean) => void;
}

export default function AuthSection({ onAuthChange }: AuthSectionProps) {
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ username: "", password: "" });
  const [salesforceCredentials, setSalesforceCredentials] = useState({ accessToken: "", instanceUrl: "" });
  const [oauthConfig, setOauthConfig] = useState({ clientId: "", clientSecret: "", instanceUrl: "" });
  const [oauthStatus, setOauthStatus] = useState<'unconfigured' | 'configured' | 'authorized'>('unconfigured');
  const [isLoadingOAuth, setIsLoadingOAuth] = useState(false);
  
  const auth = useAuth();
  const { toast } = useToast();

  // Update parent component when auth state changes
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
            description: `Welcome back, ${result.user?.username}!`
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
          description: error?.message || "Unable to connect to authentication server",
          variant: "destructive"
        });
      }
    });
  };

  const handleLogout = async () => {
    auth.logout(undefined, {
      onSuccess: () => {
        toast({
          title: "Logged Out",
          description: "You have been successfully logged out"
        });
      }
    });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.username || !registerForm.password) {
      toast({
        title: "Missing Information",
        description: "Please provide both username and password",
        variant: "destructive"
      });
      return;
    }

    if (registerForm.password.length < 4) {
      toast({
        title: "Weak Password",
        description: "Password must be at least 4 characters long",
        variant: "destructive"
      });
      return;
    }

    auth.register(registerForm, {
      onSuccess: (result) => {
        if (result.success) {
          toast({
            title: "Account Created",
            description: "You can now log in with your new account"
          });
          setRegisterForm({ username: "", password: "" });
        } else {
          toast({
            title: "Registration Failed",
            description: result.message,
            variant: "destructive"
          });
        }
      },
      onError: (error) => {
        toast({
          title: "Registration Failed",
          description: error?.message || "Unable to create account at this time",
          variant: "destructive"
        });
      }
    });
  };

  const validateSalesforceCredentials = async () => {
    if (!salesforceCredentials.accessToken || !salesforceCredentials.instanceUrl) {
      toast({
        title: "Missing Credentials",
        description: "Please provide both access token and instance URL",
        variant: "destructive"
      });
      return;
    }

    try {
      // Store credentials in localStorage for API operations
      localStorage.setItem('sf_access_token', salesforceCredentials.accessToken);
      localStorage.setItem('sf_instance_url', salesforceCredentials.instanceUrl);
      
      toast({
        title: "Salesforce Credentials Stored",
        description: "You can now use Salesforce API operations"
      });
    } catch (error) {
      toast({
        title: "Storage Failed",
        description: "Unable to store Salesforce credentials",
        variant: "destructive"
      });
    }
  };

  const configureOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oauthConfig.clientId || !oauthConfig.clientSecret || !oauthConfig.instanceUrl) {
      toast({
        title: "Missing OAuth Configuration",
        description: "Please provide all OAuth configuration fields",
        variant: "destructive"
      });
      return;
    }

    setIsLoadingOAuth(true);
    try {
      // Get CSRF token first
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
        body: JSON.stringify({
          clientId: oauthConfig.clientId,
          clientSecret: oauthConfig.clientSecret,
          instanceUrl: oauthConfig.instanceUrl
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setOauthStatus('configured');
        toast({
          title: "OAuth Configured",
          description: "You can now authorize with Salesforce"
        });
      } else {
        throw new Error(result.error || 'Configuration failed');
      }
    } catch (error: any) {
      toast({
        title: "Configuration Failed",
        description: error.message || "Unable to configure OAuth",
        variant: "destructive"
      });
    } finally {
      setIsLoadingOAuth(false);
    }
  };

  const authorizeWithSalesforce = async () => {
    setIsLoadingOAuth(true);
    try {
      const response = await fetch('/api/oauth/authorize-url', {
        method: 'GET',
        credentials: 'include'
      });

      const result = await response.json();
      
      if (result.authUrl) {
        // Open Salesforce authorization in a new window/tab to avoid iframe issues
        const authWindow = window.open(result.authUrl, '_blank', 'noopener,noreferrer');
        if (!authWindow) {
          // Fallback if popup blocked - try to break out of iframe
          try {
            if (window.top && window.top !== window) {
              window.top.location.href = result.authUrl;
            } else {
              window.location.href = result.authUrl;
            }
          } catch (e) {
            // If all fails, show instructions to user
            toast({
              title: "Authorization Required",
              description: "Please copy this URL and open it in a new tab: " + result.authUrl,
              variant: "default"
            });
          }
        } else {
          toast({
            title: "Authorization Window Opened",
            description: "Complete the authorization in the new window. You may need to allow popups.",
            variant: "default"
          });
        }
      } else {
        throw new Error(result.error || 'Failed to generate authorization URL');
      }
    } catch (error: any) {
      toast({
        title: "Authorization Failed",
        description: error.message || "Unable to start OAuth flow",
        variant: "destructive"
      });
    } finally {
      setIsLoadingOAuth(false);
    }
  };

  const refreshOAuthTokens = async () => {
    setIsLoadingOAuth(true);
    try {
      // Get CSRF token first
      const csrfResponse = await fetch('/api/auth/csrf-token', {
        credentials: 'include'
      });
      const csrfData = await csrfResponse.json();
      
      const response = await fetch('/api/oauth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.csrf_token
        },
        credentials: 'include'
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Tokens Refreshed",
          description: "Your Salesforce tokens have been refreshed"
        });
      } else {
        throw new Error(result.error || 'Token refresh failed');
      }
    } catch (error: any) {
      toast({
        title: "Refresh Failed",
        description: error.message || "Unable to refresh tokens",
        variant: "destructive"
      });
    } finally {
      setIsLoadingOAuth(false);
    }
  };

  // Show different UI based on authentication state
  if (auth.isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-2">Welcome, {auth.user?.username}!</h2>
          <p className="text-muted-foreground">You are now logged in and can access all Salesforce MCP features.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* User Account Card */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="text-primary mr-2" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={auth.user?.username || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>User ID</Label>
                <Input value={auth.user?.id || ''} disabled />
              </div>
              <Button 
                onClick={handleLogout} 
                disabled={auth.logoutIsLoading}
                variant="destructive"
                className="w-full"
                data-testid="button-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                {auth.logoutIsLoading ? "Logging out..." : "Log Out"}
              </Button>
            </CardContent>
          </Card>

          {/* OAuth Configuration Card */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="text-primary mr-2" />
                Salesforce OAuth Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="oauth" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="oauth">OAuth Setup</TabsTrigger>
                  <TabsTrigger value="manual">Manual Tokens</TabsTrigger>
                </TabsList>
                
                <TabsContent value="oauth" className="space-y-4">
                  {oauthStatus === 'unconfigured' && (
                    <form onSubmit={configureOAuth} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="oauth_client_id">Client ID</Label>
                        <Input
                          id="oauth_client_id"
                          type="text"
                          placeholder="Your Salesforce Connected App Client ID"
                          value={oauthConfig.clientId}
                          onChange={(e) => setOauthConfig(prev => ({ ...prev, clientId: e.target.value }))}
                          data-testid="input-oauth-client-id"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="oauth_client_secret">Client Secret</Label>
                        <Input
                          id="oauth_client_secret"
                          type="password"
                          placeholder="Your Salesforce Connected App Client Secret"
                          value={oauthConfig.clientSecret}
                          onChange={(e) => setOauthConfig(prev => ({ ...prev, clientSecret: e.target.value }))}
                          data-testid="input-oauth-client-secret"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="oauth_instance_url">Salesforce Instance URL</Label>
                        <Input
                          id="oauth_instance_url"
                          type="url"
                          placeholder="https://login.salesforce.com (or your domain)"
                          value={oauthConfig.instanceUrl}
                          onChange={(e) => setOauthConfig(prev => ({ ...prev, instanceUrl: e.target.value }))}
                          data-testid="input-oauth-instance-url"
                          required
                        />
                      </div>
                      <Button 
                        type="submit"
                        disabled={isLoadingOAuth}
                        className="w-full"
                        data-testid="button-configure-oauth"
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        {isLoadingOAuth ? "Configuring..." : "Configure OAuth"}
                      </Button>
                    </form>
                  )}
                  
                  {oauthStatus === 'configured' && (
                    <div className="space-y-4">
                      <div className="text-center space-y-2">
                        <p className="text-sm text-muted-foreground">OAuth is configured. Ready to authorize.</p>
                        <Button 
                          onClick={authorizeWithSalesforce}
                          disabled={isLoadingOAuth}
                          className="w-full"
                          data-testid="button-authorize-salesforce"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {isLoadingOAuth ? "Redirecting..." : "Authorize with Salesforce"}
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {oauthStatus === 'authorized' && (
                    <div className="space-y-4">
                      <div className="text-center space-y-2">
                        <div className="flex items-center justify-center space-x-2 text-green-600">
                          <Check className="h-5 w-5" />
                          <p className="font-medium">Salesforce OAuth Authorized</p>
                        </div>
                        <p className="text-sm text-muted-foreground">You can now use all Salesforce API operations.</p>
                        <Button 
                          onClick={refreshOAuthTokens}
                          disabled={isLoadingOAuth}
                          variant="outline"
                          className="w-full"
                          data-testid="button-refresh-oauth-tokens"
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          {isLoadingOAuth ? "Refreshing..." : "Refresh Tokens"}
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="manual" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sf_access_token">Access Token</Label>
                    <Input
                      id="sf_access_token"
                      type="password"
                      placeholder="Enter your Salesforce access token"
                      value={salesforceCredentials.accessToken}
                      onChange={(e) => setSalesforceCredentials(prev => ({ ...prev, accessToken: e.target.value }))}
                      data-testid="input-sf-access-token"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf_instance_url">Instance URL</Label>
                    <Input
                      id="sf_instance_url"
                      type="url"
                      placeholder="https://yourinstance.salesforce.com"
                      value={salesforceCredentials.instanceUrl}
                      onChange={(e) => setSalesforceCredentials(prev => ({ ...prev, instanceUrl: e.target.value }))}
                      data-testid="input-sf-instance-url"
                    />
                  </div>
                  <Button 
                    onClick={validateSalesforceCredentials} 
                    className="w-full"
                    data-testid="button-store-sf-credentials"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Store Salesforce Credentials
                  </Button>
                  <div className="text-sm text-muted-foreground p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-md">
                    <p><strong>Note:</strong> Manual tokens are temporary and will expire. Use OAuth for persistent authentication.</p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show login/register UI for unauthenticated users
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-2">Authentication Required</h2>
        <p className="text-muted-foreground">Please log in to access the Salesforce MCP features.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Login/Register Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="text-primary mr-2" />
              Login or Register
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login" className="space-y-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login_username">Username</Label>
                    <Input
                      id="login_username"
                      type="text"
                      placeholder="Enter your username"
                      value={loginForm.username}
                      onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
                      data-testid="input-login-username"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login_password">Password</Label>
                    <Input
                      id="login_password"
                      type="password"
                      placeholder="Enter your password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                      data-testid="input-login-password"
                      required
                    />
                  </div>
                  <Button 
                    type="submit"
                    disabled={auth.loginIsLoading}
                    className="w-full"
                    data-testid="button-login"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    {auth.loginIsLoading ? "Logging in..." : "Log In"}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="register" className="space-y-4">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register_username">Username</Label>
                    <Input
                      id="register_username"
                      type="text"
                      placeholder="Choose a username"
                      value={registerForm.username}
                      onChange={(e) => setRegisterForm(prev => ({ ...prev, username: e.target.value }))}
                      data-testid="input-register-username"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register_password">Password</Label>
                    <Input
                      id="register_password"
                      type="password"
                      placeholder="Choose a password (min 4 characters)"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm(prev => ({ ...prev, password: e.target.value }))}
                      data-testid="input-register-password"
                      required
                    />
                  </div>
                  <Button 
                    type="submit"
                    disabled={auth.registerIsLoading}
                    className="w-full"
                    data-testid="button-register"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {auth.registerIsLoading ? "Creating account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Information Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Info className="text-blue-400 mr-2" />
              Security Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start space-x-3">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold">🔒</span>
                <p>Session-based authentication with HTTP-only cookies</p>
              </div>
              <div className="flex items-start space-x-3">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold">🛡️</span>
                <p>CSRF protection and security headers enabled</p>
              </div>
              <div className="flex items-start space-x-3">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold">🔑</span>
                <p>External API access still available via API keys</p>
              </div>
              <div className="flex items-start space-x-3">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold">⚡</span>
                <p>Production-ready enterprise security standards</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
