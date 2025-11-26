import { type RouteConfig, index } from "@react-router/dev/routes";

export default [
  // Point the index route to our main converter file
  index("routes/main.tsx"),
] satisfies RouteConfig;