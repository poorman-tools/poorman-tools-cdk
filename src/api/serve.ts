import { expressApp } from "./server";

expressApp.listen(3005, () => {
  console.log("Serving on port 3005");
});
