import Testing

@testable import DesignPlayground

@Suite("Type picker taxonomy")
internal struct TypePickerTaxonomyTests {
    @Test("the fictional taxonomy is complete, uniquely identified, and connected to Item")
    func coverage() {
        let types = TypePickerTaxonomy.types
        let expectedNames = [
            "Item", "Book", "Furniture", "Storage furniture", "Home textiles",
            "Textile & soft furnishing", "Towel", "Bedding", "Sheet", "Quilt",
            "Quilt cover", "Blanket", "Mattress protector", "Pillows & cushions", "Pillows",
            "Pillow", "Pillowcase", "Cushions", "Cushion", "Cushion cover",
            "Electrical & electronics", "Electronics & appliance", "Light bulb", "Cable",
            "Charger", "Tools & supplies", "Tool", "Maker supply", "Hardware & material",
            "Tape", "Fitting", "Kitchen & bar", "Kitchen & cookware", "Bar & brewing gear",
            "Alcohol bottle", "Containers & luggage", "Storage box", "Case & bag",
            "Art & frame", "Clothing & accessory", "Outdoor, camping & BBQ", "Plant",
            "Cleaning supply", "Document & valuable", "Key", "Other item",
        ]

        #expect(types.map(\.name) == expectedNames)
        #expect(Set(types.map(\.id)).count == types.count)
        #expect(TypePickerTaxonomy.children(of: nil).map(\.id) == ["item"])
        #expect(
            types.dropFirst().allSatisfy {
                TypePickerTaxonomy.breadcrumb(for: $0.id).hasPrefix("Item › ")
            })
    }

    @Test("children preserve the declared hierarchy")
    func hierarchy() {
        #expect(
            TypePickerTaxonomy.children(of: "bedding").map(\.id) == [
                "sheet", "quilt", "quilt-cover", "blanket", "mattress-protector",
            ])
        #expect(
            TypePickerTaxonomy.children(of: "pillows-cushions").map(\.id) == [
                "pillows", "cushions",
            ])
        #expect(
            TypePickerTaxonomy.breadcrumb(for: "pillowcase")
                == "Item › Home textiles › Pillows & cushions › Pillows › Pillowcase")
        #expect(TypePickerTaxonomy.node("not-a-type") == nil)
        #expect(TypePickerTaxonomy.breadcrumb(for: "not-a-type").isEmpty)
    }

    @Test("search includes aliases and ancestor context and requires every token")
    func search() {
        #expect(TypePickerTaxonomy.search("HOME sheet").map(\.id) == ["sheet"])
        #expect(TypePickerTaxonomy.search("duvet cover").map(\.id).contains("quilt-cover"))
        #expect(TypePickerTaxonomy.search("barbecue").map(\.id) == ["outdoor-camping-bbq"])
        #expect(TypePickerTaxonomy.search("electrical adapter").map(\.id) == ["charger"])
        #expect(TypePickerTaxonomy.search("  \n ").isEmpty)
        #expect(TypePickerTaxonomy.search("teleporter").isEmpty)
    }

    @Test("related suggestions are stable and refer to real types")
    func suggestions() {
        #expect(
            TypePickerTaxonomy.suggested(after: "quilt-cover").map(\.id) == [
                "quilt", "sheet", "blanket", "mattress-protector",
            ])
        #expect(TypePickerTaxonomy.suggested(after: "cushion-cover").map(\.id) == ["cushion"])
        #expect(TypePickerTaxonomy.suggested(after: nil).isEmpty)
        #expect(TypePickerTaxonomy.suggested(after: "future-type").isEmpty)
    }
}
