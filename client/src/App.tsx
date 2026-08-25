import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Activities from "@/pages/Activities";
import Audit from "@/pages/Audit";
import Clients from "@/pages/Clients";
import Dashboard from "@/pages/Dashboard";
import Interactions from "@/pages/Interactions";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Opportunities from "@/pages/Opportunities";
import { Route, Switch } from "wouter";

function Router() {
  return <Switch><Route path="/login" component={Login} /><Route><DashboardLayout><Switch><Route path="/" component={Dashboard} /><Route path="/clientes" component={Clients} /><Route path="/oportunidades" component={Opportunities} /><Route path="/atividades" component={Activities} /><Route path="/interacoes" component={Interactions} /><Route path="/auditoria" component={Audit} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></DashboardLayout></Route></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster richColors position="top-right" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
