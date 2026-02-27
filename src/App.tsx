import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import Compare from "./pages/Compare";
import Results from "./pages/Results";
import ReadMe from "./pages/ReadMe";
import NotFound from "./pages/NotFound";

// GitHub Pages serves from /comparatief-beoordelen/; dev server uses root
const basename = import.meta.env.PROD ? "/comparatief-beoordelen" : "";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/compare/:assignmentId" element={<Compare />} />
        <Route path="/results/:assignmentId" element={<Results />} />
        <Route path="/readme" element={<ReadMe />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
