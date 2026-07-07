import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import { getToken } from "@/lib/auth";
import "./index.css";

// Point every generated API hook at the deployed API server.
// Set VITE_API_URL in your Vercel project (e.g. https://your-api.vercel.app).
// Leave it unset for local dev when using a same-origin proxy.
setBaseUrl(import.meta.env.VITE_API_URL || null);
setAuthTokenGetter(() => getToken());

createRoot(document.getElementById("root")!).render(<App />);
