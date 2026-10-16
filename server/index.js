import { createApp } from "./app.js";

const port = Number(process.env.PORT || 3001);
const app = createApp();
app.listen(port, () => console.log(`Safety Agent API running at http://localhost:${port}`));
