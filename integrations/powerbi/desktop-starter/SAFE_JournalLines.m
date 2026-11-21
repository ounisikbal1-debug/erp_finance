let
    SafeApiBase = "http://127.0.0.1:3000",
    PeriodEnd = Date.From(DateTime.LocalNow()),
    PeriodStart = Date.AddDays(PeriodEnd, -364),
    Response = Json.Document(
        Web.Contents(
            SafeApiBase,
            [
                RelativePath = "api/bi/journal-lines",
                Query = [
                    #"from" = Date.ToText(PeriodStart, [Format = "yyyy-MM-dd", Culture = "en-US"]),
                    #"to" = Date.ToText(PeriodEnd, [Format = "yyyy-MM-dd", Culture = "en-US"])
                ],
                Headers = [Accept = "application/json"]
            ]
        )
    ),
    Rows = Table.FromRecords(Response[rows], null, MissingField.UseNull),
    WithEntity = Table.AddColumn(Rows, "SAFE_Entity", each Response[entity][code], type text),
    WithCountry = Table.AddColumn(WithEntity, "SAFE_Country", each Response[entity][countryCode], type text),
    WithCurrency = Table.AddColumn(WithCountry, "SAFE_FunctionalCurrency", each Response[entity][currencyCode], type text),
    WithPeriodStart = Table.AddColumn(WithCurrency, "SAFE_PeriodStart", each Response[periodStart], type text),
    WithPeriodEnd = Table.AddColumn(WithPeriodStart, "SAFE_PeriodEnd", each Response[periodEnd], type text),
    WithGeneratedAt = Table.AddColumn(WithPeriodEnd, "SAFE_DataGeneratedAt", each Response[generatedAt], type text)
in
    WithGeneratedAt
