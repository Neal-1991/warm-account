# Image Assets

This directory contains all image assets for the 暖账 mini-program.

## Required Images

### TabBar Icons (48x48px recommended)
- tabbar/home.png - Home tab icon (inactive state)
- tabbar/stat.png - Statistics tab icon (inactive state)
- tabbar/mine.png - My tab icon (inactive state)
- tabbar/{themeId}/home-active.png - Home tab icon (active state for each theme)
- tabbar/{themeId}/stat-active.png - Statistics tab icon (active state for each theme)
- tabbar/{themeId}/mine-active.png - My tab icon (active state for each theme)

### Category Icons
- category-icons/icon_*.png - Semantic built-in category icons used by new `iconKey` values
- category-icons/expense_*.png and category-icons/income_*.png - Legacy generated icons kept for fallback compatibility

### Logo
- logo.png - App logo used by the login page and About page (512x512px source, displayed as 160rpx x 160rpx)
- ../../docs/superpowers/assets/warm-account-avatar-144.png - 144x144px WeChat mini-program avatar upload asset

### Placeholders
- default-avatar.png - Default avatar image for users without a profile picture

## Design Guidelines

- TabBar icons: active state follows the current theme accent color, inactive state uses neutral gray
- All icons should be PNG format with transparent backgrounds
- Logo should remain warm and simple, without depending on a single theme color
