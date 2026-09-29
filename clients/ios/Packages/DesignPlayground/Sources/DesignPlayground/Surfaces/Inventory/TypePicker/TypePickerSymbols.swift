extension TypePickerType {
    var symbol: String {
        switch id {
        case "book": "book.closed"
        case "furniture", "storage-furniture": "cabinet"
        case "home-textiles", "textile-soft-furnishing", "towel": "square.stack"
        case "bedding", "sheet", "quilt", "quilt-cover", "blanket", "mattress-protector":
            "bed.double"
        case "pillows-cushions", "pillows", "pillow", "pillowcase", "cushions", "cushion",
            "cushion-cover":
            "square.on.square"
        case "electrical-electronics", "electronics-appliance": "powerplug"
        case "light-bulb": "lightbulb"
        case "cable", "charger": "cable.connector"
        case "tools-supplies", "tool", "hardware-material", "fitting": "wrench.and.screwdriver"
        case "kitchen-bar", "kitchen-cookware": "fork.knife"
        case "bar-brewing-gear", "alcohol-bottle": "wineglass"
        case "containers-luggage", "storage-box": "shippingbox"
        case "case-bag": "bag"
        case "art-frame": "photo.artframe"
        case "clothing-accessory": "tshirt"
        case "outdoor-camping-bbq": "tent"
        case "plant": "leaf"
        case "cleaning-supply": "sparkles"
        case "document-valuable": "doc"
        case "key": "key"
        default: "square.grid.2x2"
        }
    }
}
