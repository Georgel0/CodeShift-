// app/routes.ts
import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  // The layout holds the persistent UI (Sidebar, Header, Auth)
  layout("routes/layout.tsx", [
    
    // The Index/Home page (Dashboard)
    index("routes/_index.tsx"),
    
    // Feature Routes
    route("css", "routes/converters/css.tsx"),
    // Add future converters here: route("sql", "routes/converters/sql.tsx"),
  ]),
] satisfies RouteConfig;
