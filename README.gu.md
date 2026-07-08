# FlowPilot — ગુજરાતી માર્ગદર્શિકા (README)

**FlowPilot** એ એક એન્ટરપ્રાઇઝ-ગ્રેડ **Browser Automation અને Website Testing** પ્લેટફોર્મ છે. તે એક ડેસ્કટોપ એપ્લિકેશન છે જે **desktop-first, cloud-optional** છે — એટલે કે તમારો ડેટા ડિફૉલ્ટ રૂપે તમારા કમ્પ્યુટર પર જ રહે છે, ક્લાઉડ પર જવું ફરજિયાત નથી.

આ ડોક્યુમેન્ટ **લાઇન-બાય-લાઇન** સમજાવે છે કે આ પ્રોજેક્ટ કેવી રીતે કામ કરે છે.

> સંપૂર્ણ ડિઝાઇન માટે જુઓ: [docs/BLUEPRINT.md](docs/BLUEPRINT.md) · નિર્ણયો માટે: [docs/adr/](docs/adr/) · હાલના તબક્કા માટે: [docs/PHASE1_BUILD_SPEC.md](docs/PHASE1_BUILD_SPEC.md)

---

## 1. મૂળ વિચાર (The mental model) — ૩ દીવાલો

આ એપ **Electron** પર બનેલી છે. Electron એપમાં ત્રણ અલગ-અલગ પ્રોસેસ (processes) હોય છે, અને દરેક વચ્ચે એક "દીવાલ" (security boundary) હોય છે:

```
┌──────────────────┐   window.flowpilot   ┌───────────────┐   ipcMain.handle   ┌───────────────┐
│  RENDERER         │ ─────────────────► │  PRELOAD       │ ────────────────► │  MAIN          │
│  (React UI,        │   (એકમાત્ર દરવાજો)  │  (પાતળો પુલ)    │                   │  (Node, DB…)    │
│   Node વગર)        │ ◄───────────────── │  index.ts      │ ◄──────────────── │  ipc-router.ts │
└──────────────────┘   validated result  └───────────────┘                   └───────────────┘
```

- **RENDERER** — તમે જે સ્ક્રીન જુઓ છો (React). આ પ્રોસેસ **files, database, કે Node ને સીધું અડી શકતી નથી**. તે ફક્ત `window.flowpilot` ને જ કૉલ કરી શકે છે.
- **PRELOAD** — એક નાનો "પુલ" (bridge). તે નક્કી કરે છે કે UI ને શું-શું કરવાની પરવાનગી છે.
- **MAIN** — શક્તિશાળી પ્રોસેસ. તેની પાસે Node, database, keychain, અને બધા privileges છે.

આ અલગતા (isolation) જ સુરક્ષાનો પાયો છે (જુઓ ADR 0004).

---

## 2. ફોલ્ડર સ્ટ્રક્ચર (Monorepo)

| પાથ (Path) | શું છે |
|---|---|
| `apps/desktop` | Electron એપ (main / preload / renderer) |
| `shared/ipc-contracts` | Renderer↔Main વચ્ચેનો **ટાઇપ્ડ કરાર** (સૌથી પહેલા બનાવેલો) |
| `shared/errors`, `shared/logger` | ટાઇપ્ડ errors અને structured logging |
| `packages/core-domain` | શુદ્ધ (pure) domain + Scenario JSON schema |
| `packages/data-access` | Drizzle schema, repositories, migrations (SQLite→Postgres) |
| `packages/core-services` | Framework વગરના use-cases (ભવિષ્યની cloud API પણ આ જ વાપરશે) |

**મુખ્ય નિયમ:** `core-services` અને `core-domain` ક્યારેય `electron` ને import ન કરે — જેથી ભવિષ્યમાં એ જ કોડ cloud server પર ચાલી શકે.

---

## 3. એપ કેવી રીતે ચલાવવી (How to run)

**જરૂરિયાત:** Node.js ≥ 20.11 અને pnpm 9.

```bash
# પ્રોજેક્ટ ફોલ્ડરમાં જાઓ (e:\Adsencs\traffic)

pnpm install       # બધા packages ઇન્સ્ટૉલ કરો (Electron ~100MB ડાઉનલોડ થશે)
pnpm dev           # Electron એપ ચાલુ કરો
```

`pnpm dev` ચલાવતાં એક Electron વિન્ડો ખૂલશે — "FlowPilot — walking skeleton". તેમાં project નું નામ લખી **Create** દબાવો; આ પૂરો renderer → preload → main → validate નો પ્રવાસ ચલાવે છે.

> **નોંધ:** જો `pnpm` PATH માં ન હોય, તો `npx pnpm dev` વાપરો.

---

## 4. એક "Create" ક્લિકનો પૂરો પ્રવાસ

જ્યારે તમે **Create** બટન દબાવો ત્યારે અંદર શું થાય છે:

```
તમે "Create" દબાવો
  → App.tsx create()                    [RENDERER]  { name, environment } બનાવે
  → window.flowpilot.invoke(...)         [PRELOAD]   ipcRenderer.invoke થી આગળ મોકલે
  → ipcMain.handle callback             [MAIN]      મેસેજ મળે
      → spec.request.parse()                        ✅ તમારો input તપાસે (zod)
      → handlers["project:create"]()                project object બનાવે
      → spec.response.parse()                       ✅ output તપાસે
      → returns { ok: true, data }
  → preload થઈ પાછું App.tsx સુધી                    setStatus("created")
```

દરેક તીર (arrow) એક પ્રોસેસની દીવાલ ઓળંગે છે, અને દરેક ડેટા main-process ના દરવાજે **zod schema** થી તપાસાય છે.

---

## 5. મુખ્ય ફાઇલો — લાઇન-બાય-લાઇન

### 5.1 `apps/desktop/src/main/index.ts` — બૂટ (શરૂઆત)

આ ફાઇલ સૌથી પહેલા, privileged Node પ્રોસેસમાં ચાલે છે.

```ts
import { app, BrowserWindow } from "electron";
```
- `app` = એપ્લિકેશનનું જીવનચક્ર (lifecycle). `BrowserWindow` = OS ની અસલી વિન્ડો જે વેબ પેજ બતાવે.

```ts
const win = new BrowserWindow({
  webPreferences: {
    preload: join(__dirname, "../preload/index.cjs"),  // preload સ્ક્રિપ્ટ
    sandbox: true,           // વેબ પેજ locked-down sandbox માં
    contextIsolation: true,  // પેજ અને preload ના JavaScript અલગ દુનિયામાં
    nodeIntegration: false,  // પેજને Node/require/fs કંઈ જ નહીં
  },
});
```
- આ આખો બ્લોક જ **સુરક્ષા-નીતિ** છે. `sandbox: true` ને કારણે preload **CommonJS** (`.cjs`) હોવું જરૂરી છે — તેથી આપણે `index.cjs` વાપરીએ છીએ.

```ts
if (process.env.ELECTRON_RENDERER_URL) {
  win.loadURL(process.env.ELECTRON_RENDERER_URL);   // dev: live server (localhost:5173)
} else {
  win.loadFile(join(__dirname, "../renderer/index.html"));  // production: ફાઇલ
}
```
- **Dev માં** hot-reload વાળા Vite server થી, **production માં** disk પરની ફાઇલ થી પેજ લોડ થાય.

```ts
app.whenReady().then(() => {
  registerIpcRouter();   // પહેલા બધા IPC handlers ચાલુ કરો
  createWindow();        // પછી વિન્ડો બનાવો
  log.info("FlowPilot main process ready");
}).catch((err) => {
  log.fatal({ err }, "startup failed");  // ભૂલ થાય તો log કરી બંધ કરો
  app.quit();
});
```
- Electron તૈયાર થાય પછી — પહેલા handlers, પછી વિન્ડો, પછી log. પેલી `"FlowPilot main process ready"` લાઇન જ સાબિત કરે છે કે boot સફળ થયું.

```ts
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();  // છેલ્લી વિન્ડો બંધ → એપ બંધ
});
```
- આ જ લાઇનને કારણે વિન્ડો બંધ કરતાં એપ સ્વચ્છ રીતે (exit 0) બંધ થાય છે.

### 5.2 `apps/desktop/src/preload/index.ts` — પુલ (Bridge)

```ts
const api = {
  invoke(channel, request) {
    return ipcRenderer.invoke(channel, request);  // main ને મેસેજ મોકલે
  },
};

contextBridge.exposeInMainWorld("flowpilot", api);
```
- **સૌથી અગત્યની લાઇન:** `exposeInMainWorld("flowpilot", api)` — તે `api` ને વેબ પેજ પર `window.flowpilot` તરીકે મૂકે છે. `contextIsolation` ને કારણે **ફક્ત આટલું જ** પેજ સુધી પહોંચે — બાકી `ipcRenderer`, Node કંઈ નહીં.
- જો આ લાઇન ન ચાલે, તો `window.flowpilot` `undefined` થઈ જાય અને આખી UI બંધ પડે (પહેલા આ જ bug હતો).

### 5.3 `shared/ipc-contracts` — કરાર (The rulebook)

```ts
export const ipcContract = {
  "project:create": {
    request:  z.object({ name: z.string().min(1), environment: Environment }),
    response: z.object({ data: Project }),
  },
  // ...
};
```
- દરેક channel માટે request અને response ની **zod schema**. એક જ જગ્યાએ લખેલી આ schema — બંને પ્રોસેસ માટે **compile-time types** અને **runtime validation** આપે છે.

### 5.4 `apps/desktop/src/main/ipc-router.ts` — Handler

```ts
export function registerIpcRouter() {
  for (const channel of Object.keys(ipcContract)) {
    ipcMain.handle(channel, async (_event, rawRequest) => {
      const spec = ipcContract[channel];
      try {
        const request = spec.request.parse(rawRequest);        // 1) input તપાસો
        const result  = await handlers[channel](request);      // 2) કામ કરો
        return { ok: true, data: spec.response.parse(result) }; // 3) output તપાસો
      } catch (err) {
        log.error({ channel, err }, "ipc handler failed");
        return { ok: false, error: toProblem(err) };           // સ્વચ્છ error પાછો
      }
    });
  }
}
```
આ જ **સુરક્ષાનું હૃદય** છે — ત્રણ પગલાં:
1. `request.parse()` — renderer તરફથી આવેલો ડેટા schema થી તપાસો. ખોટો ડેટા હોય તો અહીં જ અટકે, handler સુધી પહોંચે નહીં.
2. handler ને validated ડેટા સાથે ચલાવો.
3. handler નો output પણ તપાસો, પછી `{ ok: true, data }` માં લપેટીને પાછો આપો.
- કોઈ પણ ભૂલ થાય તો `catch` તેને `{ ok: false, error }` માં ફેરવે — UI ને હંમેશા વ્યવસ્થિત જવાબ મળે, ક્યારેય crash નહીં.

### 5.5 `apps/desktop/src/renderer/src/App.tsx` — UI

```ts
async function create() {
  if (!name.trim()) return;
  setStatus("creating…");
  const res = await window.flowpilot.invoke("project:create", { name, environment: "prod" });
  setStatus(res.ok ? "created" : `error: ${res.error.code}`);
  setName("");
  await refresh();
}
```
- Create દબાવતાં: ખાલી હોય તો રોકો → "creating…" બતાવો → **પુલ ઓળંગીને** `window.flowpilot.invoke` કૉલ કરો → જવાબ પ્રમાણે status બતાવો → list ફરી લોડ કરો.

---

## 6. હાલની સ્થિતિ (Phase 1 — walking skeleton)

- ✅ જે **કામ કરે છે**: Electron ના ૩ tiers, સુરક્ષિત IPC (બંને બાજુ zod validation), hardened renderer (`sandbox:true`), CommonJS preload, અને સ્વચ્છ shutdown — બધું ચાલે છે અને verify થયું છે.
- ⏳ જે હજી **stub** છે: handlers હાલ **in-memory** છે. એટલે project બનાવ્યા પછી તે list માં દેખાશે નહીં (કારણ કે `project:list` હાલ ખાલી `[]` પાછું આપે છે). Database સાથે જોડાણ એ **આગળનું પગલું** છે.

**આગળનું પગલું:** SQLite database ને `createDb` થી ચાલુ કરવું, Drizzle migration ચલાવવી, `DrizzleProjectRepository` + `RunService` ને DI container દ્વારા જોડવા, અને stub handlers ને અસલી services થી બદલવા — જેથી projects ખરેખર save અને list થાય.

---

## 7. મુખ્ય નિયમો (Guardrails — તોડવા નહીં)

- `core-services` / `core-domain` ક્યારેય `electron` import ન કરે (ADR 0004).
- બધો DB access repository interfaces દ્વારા જ (ADR 0003).
- દરેક tenant-scoped query માં `team_id` હોવું જ જોઈએ (ADR 0005).
- દરેક IPC payload બંને બાજુ `@flowpilot/ipc-contracts` થી validate થાય.
