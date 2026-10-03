/// Builds the app context that accompanies an Ego turn from the current
/// feature and the visible screen.
///
/// Feature ids are translated to owning pillar ids where they differ. A
/// presented object URI takes precedence over a record route because feature
/// flows may own navigation stacks the composition root cannot see.
public func makeEgoAppContext(
    feature: MobileFeature?,
    routerPath: [Route],
    presentedObjectURI: String?
) -> EgoAppContext? {
    let app: String
    if let feature {
        switch feature.rawValue {
        case "transactions", "accounts":
            app = "finance"
        case "purchases":
            app = "purchases"
        case "inventory":
            app = "inventory"
        default:
            app = feature.rawValue
        }
    } else if let presentedObjectURI, let object = parseObjectURI(presentedObjectURI) {
        app = object.pillar
    } else {
        return nil
    }

    let uri =
        presentedObjectURI
        ?? routerPath.last.flatMap { route in
            switch route {
            case .transactionDetail(let id):
                "pops:finance/transaction/\(id)"
            case .accountDetail(let id):
                "pops:finance/account/\(id)"
            case .transactionList, .accountsList:
                nil
            }
        }

    return EgoAppContext(app: app, uri: uri, route: nil, entityTitle: nil)
}
