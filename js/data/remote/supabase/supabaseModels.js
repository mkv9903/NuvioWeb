export function mapSupabaseProfile(row = {}) {
  return {
    id: row.id || "",
    name: row.name || "User",
    avatarColorHex: row.avatar_color_hex || "#1E88E5",
    avatarId: row.avatar_id || row.avatarId || null,
    avatarUrl: row.avatar_url || row.avatarUrl || null,
    profileBackgroundId:
      String(row.profile_background_id || row.profileBackgroundId || "").trim() || null,
    profileBackgroundUrl: row.profile_background_url || row.profileBackgroundUrl || null,
    usesPrimaryAddons: Boolean(row.uses_primary_addons || row.usesPrimaryAddons),
    usesPrimaryPlugins: Boolean(row.uses_primary_plugins || row.usesPrimaryPlugins),
    isPrimary: Boolean(row.is_primary)
  };
}
