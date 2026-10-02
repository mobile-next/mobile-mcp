export type Shot = { file: string; generation: number; width: number; height: number };
export type Platform = "android" | "ios";
export type Target = { id: string; platform: Platform; screenWidth: number; screenHeight: number };

declare module "claude-code" {
	interface PluginState {
		"mobile-mcp": { shot: Shot; target: Target | null; streamId: number; isAskingUrl: boolean }
	}
}
