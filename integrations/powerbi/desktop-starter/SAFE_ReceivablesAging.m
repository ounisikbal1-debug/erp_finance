let
    SafeApiBase = "http://127.0.0.1:3000",
    AsOf = Date.From(DateTime.LocalNow()),
    Response = Json.Document(
        Web.Contents(
            SafeApiBase,
            [
                RelativePath = "api/bi/receivables-aging",
                Query = [
                    asOf = Date.ToText(AsOf, [Format = "yyyy-MM-dd", Culture = "en-US"])
                ],
                Headers = [Accept = "application/json"]
            ]
        )
    ),
    Invoices = Table.FromRecords(Response[invoices], null, MissingField.UseNull),
    WithEntity = Table.AddColumn(Invoices, "SAFE_Entity", each Response[entity][name], type text),
    WithCurrency = Table.AddColumn(WithEntity, "SAFE_Currency", each Response[entity][currencyCode], type text),
    WithAsOf = Table.AddColumn(WithCurrency, "SAFE_AsOf", each Response[asOf], type text),
    WithGeneratedAt = Table.AddColumn(WithAsOf, "SAFE_DataGeneratedAt", each Response[generatedAt], type text),
    WithOutstandingTotal = Table.AddColumn(WithGeneratedAt, "SAFE_TotalOutstanding", each Response[totals][outstanding], type number)
in
    WithOutstandingTotal
