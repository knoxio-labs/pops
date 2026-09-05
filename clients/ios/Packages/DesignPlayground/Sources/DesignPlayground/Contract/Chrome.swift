/// The navigation chrome a surface is drawn inside.
///
/// This is the axis the web playground structurally cannot have. A nav bar, a
/// tab bar and a sheet are not decoration the canvas can approximate — they
/// are system views with their own materials, their own scroll-edge
/// behaviour and their own safe areas, and in iOS 26 they are also where
/// Liquid Glass actually comes from. A surface reviewed without them has been
/// reviewed without the half of the screen the system draws.
///
/// A surface names the chrome it is designed for; the inspector can override
/// that for as long as you stay on it.
public enum Chrome: String, CaseIterable, Identifiable, Sendable {
    /// No chrome at all — the surface fills the device. For a component sheet
    /// or a screen that really is presented bare.
    case bare
    /// A `NavigationStack` with an inline title.
    case navigation
    /// A `NavigationStack` with a large title, which is the one that collapses
    /// on scroll and the reason a long list looks different from a short one.
    case navigationLarge
    /// Inside a `TabView`, with the surface as the selected tab.
    case tabbed
    /// Both: a tab bar under a navigation stack, which is what most screens in
    /// a shipping app actually sit in.
    case navigationAndTabs
    /// Presented as a sheet over a stand-in backdrop, at the detents a real
    /// presentation would use.
    case sheet

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .bare: "None"
        case .navigation: "Nav bar"
        case .navigationLarge: "Large title"
        case .tabbed: "Tab bar"
        case .navigationAndTabs: "Nav + tabs"
        case .sheet: "Sheet"
        }
    }

    public var symbol: String {
        switch self {
        case .bare: "rectangle"
        case .navigation: "rectangle.topthird.inset.filled"
        case .navigationLarge: "textformat.size.larger"
        case .tabbed: "rectangle.bottomthird.inset.filled"
        case .navigationAndTabs: "rectangle.split.1x2"
        case .sheet: "rectangle.portrait.bottomhalf.filled"
        }
    }

    /// Whether this chrome draws a tab bar the inspector has to clear.
    ///
    /// The inspector floats at the bottom edge, which is exactly where iOS 26
    /// floats a tab bar — without this the two land on top of each other and
    /// neither is usable.
    public var showsTabBar: Bool {
        switch self {
        case .tabbed, .navigationAndTabs: true
        case .bare, .navigation, .navigationLarge, .sheet: false
        }
    }
}
