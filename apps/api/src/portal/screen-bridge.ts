// @yuika/api — SCR-7: jembatan tipis ke screen manager core. Dipisah sebagai
// modul agar unit test PortalHostService bisa memalsukan stream frame tanpa
// browser asli (vi.mock modul ini).
import { getScreenState, listScreens, subscribeScreen } from "@yuika/core";

export { getScreenState, listScreens, subscribeScreen };
