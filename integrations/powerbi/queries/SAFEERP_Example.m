let
    SafeApiBase = "http://127.0.0.1:3000",
    Dataset = "journal-lines",
    PeriodStart = #date(2026, 1, 1),
    PeriodEnd = #date(2026, 12, 31),
    DatasetPaths = [
        #"journal-lines" = "api/bi/journal-lines",
        #"sales-invoices" = "api/bi/sales-invoices",
        #"purchase-invoices" = "api/bi/purchase-invoices"
    ],
    DatasetPath = Record.Field(DatasetPaths, Dataset),
    Response = Json.Document(
        Web.Contents(
            SafeApiBase,
            [
                RelativePath = DatasetPath,
                Query = [
                    #"from" = Date.ToText(PeriodStart, [Format = "yyyy-MM-dd", Culture = "en-US"]),
                    #"to" = Date.ToText(PeriodEnd, [Format = "yyyy-MM-dd", Culture = "en-US"])
                ],
                Headers = [Accept = "application/json"]
            ]
        )
    ),
    Result = Table.FromRecords(Response[rows], null, MissingField.UseNull)
in
    Result
