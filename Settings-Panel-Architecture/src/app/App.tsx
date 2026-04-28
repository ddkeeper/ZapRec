import React from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "sonner";
import "../styles/theme.css";

export default function App() {
  return (
    <React.StrictMode>
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <RouterProvider router={router} />
      </div>
      <Toaster 
        position="top-right" 
        richColors 
        theme="light"
        toastOptions={{
          style: { borderRadius: '12px' },
        }}
      />
    </React.StrictMode>
  );
}
