import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { General } from "./pages/General";
import { Shortcuts } from "./pages/Shortcuts";
import { Recordings } from "./pages/Recordings";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: General },
      { path: "shortcuts", Component: Shortcuts },
      { path: "recordings", Component: Recordings },
    ],
  },
]);
