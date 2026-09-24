import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorHandlers } from "@/lib/logger";

// Window-level error + unhandled-rejection logging, installed before the
// first render so even boot-time crashes are captured in the console.
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(<App />);
