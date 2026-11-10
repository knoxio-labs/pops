/// Fictional contact source identities are independent of names and preserve labelled methods.
internal func tripsBrowserBrazilContacts() -> [TripsBrowserContact] {
    [
        .init(
            id: "marina", name: "Marina Duarte", kind: .person,
            methods: [.init(id: "email", label: "Email", value: "marina@example.test")],
            notes: "Ask about meeting near Amparo.", sourceIDs: ["marina-coffee"]),
        .init(
            id: "carmo-contact", name: "Pousada do Carmo", kind: .business,
            methods: [
                .init(
                    id: "reservations", label: "Reservations email",
                    value: "reservas@carmo.example.test"),
                .init(id: "reception", label: "Reception phone", value: "+55 81 0000 0129"),
            ],
            addresses: [.init(id: "olinda", label: "Olinda", value: "Rua do Amparo, Olinda")],
            notes: "Ask reception about late arrival.", sourceIDs: ["carmo"]),
        .init(
            id: "lina", name: "Lina Prado", kind: .person,
            methods: [.init(id: "email", label: "Email", value: "lina@example.test")],
            notes: "Contact saved for Florianópolis."),
    ]
}

/// Original metadata and explicit associations, with no fabricated file bytes or offline state.
internal func tripsBrowserBrazilDocuments() -> [TripsBrowserDocument] {
    [
        .init(
            id: "poa-ticket", title: "Flight ticket", fileName: "poa-rec-ticket.pdf",
            mimeType: "application/pdf",
            sourceIDs: ["poa-rec"]),
        .init(
            id: "carmo-confirmation", title: "Stay confirmation",
            fileName: "carmo-confirmation.pdf",
            mimeType: "application/pdf", sourceIDs: ["carmo"], visitIDs: ["olinda-visit"]),
        .init(
            id: "concert-ticket", title: "Concert ticket", fileName: "concert-ticket.pdf",
            mimeType: "application/pdf",
            sourceIDs: ["concert"], visitIDs: ["olinda-visit"]),
        .init(
            id: "trip-notes", title: "Route notes", fileName: "route-notes.txt",
            mimeType: "text/plain",
            notes: "Keep the original plan alongside linked confirmations."),
    ]
}
