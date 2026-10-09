import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import EventView from "./routes/EventView";
import Archive from "./routes/Archive";
import Info from "./routes/Info";
import Cv from "./routes/Cv";
import "./styles/global.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <EventView /> },
      { path: "archive", element: <Archive /> },
      { path: "info", element: <Info /> },
      { path: "cv", element: <Cv /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
