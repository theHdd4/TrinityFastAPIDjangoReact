
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Projects from "./pages/Projects";
import Apps from "./pages/Apps";
import Workflow from "./pages/Workflow";
import Laboratory from "./pages/Laboratory";
import Exhibition from "./pages/Exhibition";
import NotFound from "./pages/NotFound";
import Users from "./pages/Users";
import Clients from "./pages/Clients";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/projects" element={
              <ProtectedRoute>
                <Projects />
              </ProtectedRoute>
            } />
            <Route path="/" element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            } />
            <Route path="/apps" element={
              <ProtectedRoute>
                <Apps />
              </ProtectedRoute>
            } />
            <Route path="/workflow" element={
              <ProtectedRoute>
                <Workflow />
              </ProtectedRoute>
            } />
            <Route path="/laboratory" element={
              <ProtectedRoute>
                <Laboratory />
              </ProtectedRoute>
            } />
            <Route path="/exhibition" element={
              <ProtectedRoute>
                <Exhibition />
              </ProtectedRoute>
            } />
            <Route path="/users" element={
              <ProtectedRoute>
                <Users />
              </ProtectedRoute>
            } />
            <Route path="/clients" element={
              <ProtectedRoute>
                <Clients />
              </ProtectedRoute>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
