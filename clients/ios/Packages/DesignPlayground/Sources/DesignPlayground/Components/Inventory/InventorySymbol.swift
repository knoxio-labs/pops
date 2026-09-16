/// One glyph per concept, on both clients.
///
/// A concept drawn with two different symbols on two screens reads as two
/// concepts, so every Inventory component takes its glyph from here and
/// nowhere else. Each entry carries the Lucide icon the web client uses for
/// the same concept, so the two stay paired by construction rather than by
/// someone remembering.
///
/// The SF Symbol names are checked against the platform's own catalogue in
/// `InventorySymbolTests`; the Lucide names were checked against the
/// `lucide-react` build the web client ships (1.31), which no longer has a
/// `History` icon, `RotateCcwClock` is its equivalent.
internal struct InventorySymbol: Equatable {
    internal let system: String
    internal let lucide: String

    internal static let item = InventorySymbol(system: "cube", lucide: "Box")
    internal static let openContainer = InventorySymbol(
        system: "shippingbox", lucide: "PackageOpen")
    internal static let closedContainer = InventorySymbol(
        system: "shippingbox.fill", lucide: "Package")
    internal static let location = InventorySymbol(system: "house", lucide: "House")
    internal static let inHand = InventorySymbol(system: "hand.raised", lucide: "Hand")
    internal static let activity = InventorySymbol(
        system: "clock.arrow.circlepath", lucide: "RotateCcwClock")
    internal static let repair = InventorySymbol(
        system: "arrow.trianglehead.2.clockwise.rotate.90", lucide: "RefreshCw")
    internal static let code = InventorySymbol(system: "qrcode", lucide: "QrCode")
    internal static let queued = InventorySymbol(
        system: "icloud.and.arrow.up", lucide: "CloudUpload")
    internal static let synced = InventorySymbol(system: "checkmark.icloud", lucide: "CloudCheck")
    internal static let stale = InventorySymbol(
        system: "exclamationmark.triangle", lucide: "TriangleAlert")
    internal static let attention = InventorySymbol(
        system: "exclamationmark.circle.fill", lucide: "CircleAlert")
    internal static let move = InventorySymbol(
        system: "arrow.up.and.down.and.arrow.left.and.right", lucide: "Move")
    internal static let split = InventorySymbol(system: "scissors", lucide: "Scissors")
    internal static let label = InventorySymbol(system: "tag", lucide: "Tag")
    internal static let seal = InventorySymbol(system: "lock", lucide: "Lock")
    internal static let close = InventorySymbol(
        system: "shippingbox.and.arrow.backward", lucide: "PackageCheck")
    internal static let restore = InventorySymbol(
        system: "arrow.uturn.backward", lucide: "ArchiveRestore")
    internal static let discard = InventorySymbol(system: "trash", lucide: "Trash2")
    internal static let retired = InventorySymbol(system: "archivebox", lucide: "Archive")
    internal static let lost = InventorySymbol(
        system: "questionmark.circle", lucide: "CircleQuestionMark")
    internal static let destroyed = InventorySymbol(system: "xmark.octagon", lucide: "OctagonX")
    internal static let edit = InventorySymbol(system: "pencil", lucide: "Pencil")
    internal static let printLabel = InventorySymbol(system: "printer", lucide: "Printer")
    internal static let search = InventorySymbol(system: "magnifyingglass", lucide: "Search")
    internal static let addNew = InventorySymbol(system: "plus", lucide: "Plus")
    internal static let pickExisting = InventorySymbol(
        system: "checklist", lucide: "ListChecks")
    internal static let capability = InventorySymbol(system: "switch.2", lucide: "ToggleRight")
    internal static let photo = InventorySymbol(system: "photo", lucide: "Image")
    /// A type arriving with a release, which is the only way one arrives
    /// (ADR-001). A download rather than a cloud, because nothing is fetched:
    /// the type was in the app before the phone noticed what it covers.
    internal static let update = InventorySymbol(
        system: "arrow.down.circle", lucide: "ArrowDownToLine")
    /// The things waiting for a type. A tray, because it is a pile of work
    /// somebody else clears rather than something to be answered here.
    internal static let waiting = InventorySymbol(system: "tray", lucide: "Inbox")
    internal static let offline = InventorySymbol(system: "wifi.slash", lucide: "WifiOff")
    internal static let held = InventorySymbol(system: "pause.circle", lucide: "CirclePause")
    internal static let media = InventorySymbol(system: "photo.stack", lucide: "Images")
    internal static let resolved = InventorySymbol(
        system: "checkmark.circle", lucide: "CircleCheck")
    internal static let signIn = InventorySymbol(system: "person.badge.key", lucide: "KeyRound")
    internal static let storage = InventorySymbol(system: "internaldrive", lucide: "HardDrive")
    internal static let appUpdate = InventorySymbol(system: "arrow.down.app", lucide: "Download")
    internal static let dictate = InventorySymbol(system: "mic", lucide: "Mic")
    internal static let camera = InventorySymbol(system: "camera", lucide: "Camera")
    internal static let library = InventorySymbol(system: "photo.on.rectangle", lucide: "Images")
    internal static let add = InventorySymbol(system: "plus", lucide: "Plus")
    internal static let suggest = InventorySymbol(system: "sparkles", lucide: "Sparkles")
    internal static let externalIdentifier = InventorySymbol(
        system: "barcode", lucide: "Barcode")
    internal static let provenance = InventorySymbol(system: "doc.text", lucide: "FileText")
    internal static let duplicate = InventorySymbol(system: "doc.on.doc", lucide: "Copy")
    internal static let group = InventorySymbol(system: "square.stack", lucide: "Layers")
    internal static let reorder = InventorySymbol(
        system: "line.3.horizontal", lucide: "GripVertical")
    internal static let unavailable = InventorySymbol(system: "slash.circle", lucide: "CircleOff")
    internal static let donated = InventorySymbol(system: "gift", lucide: "Gift")
    internal static let sold = InventorySymbol(system: "banknote", lucide: "Banknote")
    internal static let consumed = InventorySymbol(system: "flame", lucide: "Flame")
    internal static let reduceQuantity = InventorySymbol(
        system: "minus.circle", lucide: "MinusCircle")

    /// Every entry, for the test that checks them and for the sheet that shows
    /// them side by side.
    internal static let all: [(name: String, symbol: InventorySymbol)] = [
        ("Item", item),
        ("Open container", openContainer),
        ("Closed container", closedContainer),
        ("Location", location),
        ("In hand", inHand),
        ("Activity", activity),
        ("Repair", repair),
        ("Inventory code", code),
        ("Queued", queued),
        ("Synced", synced),
        ("Stale", stale),
        ("Needs attention", attention),
        ("Move", move),
        ("Split", split),
        ("Label", label),
        ("Seal", seal),
        ("Close", close),
        ("Restore", restore),
        ("Discard", discard),
        ("Retired", retired),
        ("Lost", lost),
        ("Destroyed", destroyed),
        ("Edit", edit),
        ("Print label", printLabel),
        ("Search", search),
        ("Add new", addNew),
        ("Pick existing", pickExisting),
        ("Containment capability", capability),
        ("Photo", photo),
        ("Update", update),
        ("Waiting for a type", waiting),
        ("Offline", offline),
        ("Held", held),
        ("Staged media", media),
        ("Resolved", resolved),
        ("Sign in", signIn),
        ("Storage", storage),
        ("App update", appUpdate),
        ("Dictate", dictate),
        ("Camera", camera),
        ("Photo library", library),
        ("Add", add),
        ("Suggest", suggest),
        ("External identifier", externalIdentifier),
        ("Provenance", provenance),
        ("Duplicate", duplicate),
        ("Group", group),
        ("Reorder", reorder),
        ("Unavailable", unavailable),
        ("Donated", donated),
        ("Sold", sold),
        ("Consumed", consumed),
        ("Reduce quantity", reduceQuantity),
    ]

    /// The glyph for a container in a given state.
    internal static func container(_ access: InventoryAccess) -> InventorySymbol {
        switch access {
        case .open: openContainer
        case .closed: closedContainer
        case .sealed: seal
        }
    }
}
