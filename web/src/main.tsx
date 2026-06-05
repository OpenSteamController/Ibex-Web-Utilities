import { createRoot } from "react-dom/client";
import { App } from "./App";
import { NotificationsProvider } from "./notifications-context";
import { UnsupportedBrowser, browserSupportsWebApis } from "./components/UnsupportedBrowser";
import "./index.css";
import "./global.sass";

createRoot(document.getElementById("root")!).render(
  browserSupportsWebApis ? (
    <NotificationsProvider>
      <App />
    </NotificationsProvider>
  ) : (
    <UnsupportedBrowser />
  ),
);
