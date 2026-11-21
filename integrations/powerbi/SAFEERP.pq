section SAFEERP;

[DataSource.Kind="SAFEERP", Publish="SAFEERP.Publish"]
shared SAFEERP.Contents = (
    BaseUrl as (type text meta [DataSource.Path = true]),
    Dataset as text,
    FromDate as date,
    ToDate as date
) as table =>
let
    DatasetPaths = [
        #"journal-lines" = "api/bi/journal-lines",
        #"sales-invoices" = "api/bi/sales-invoices",
        #"purchase-invoices" = "api/bi/purchase-invoices"
    ],
    DatasetPath = if Record.HasFields(DatasetPaths, Dataset)
        then Record.Field(DatasetPaths, Dataset)
        else error Error.Record("SAFEERP.Dataset", "Dataset SAFE non pris en charge.", Dataset),
    UrlParts = Uri.Parts(BaseUrl),
    Scheme = Text.Lower(UrlParts[Scheme]),
    Host = Text.Lower(UrlParts[Host]),
    IsLoopback = List.Contains({"127.0.0.1", "localhost", "[::1]"}, Host),
    IsSecureTransport = Scheme = "https" or (Scheme = "http" and IsLoopback),
    CheckedBaseUrl = if IsSecureTransport
        then Text.TrimEnd(BaseUrl, {"/"})
        else error Error.Record("SAFEERP.Transport", "Utilisez HTTPS, sauf pour une API SAFE sur la machine locale.", BaseUrl),
    Credential = Extension.CurrentCredential(),
    LoginPayload = Json.Document(
        Web.Contents(
            CheckedBaseUrl,
            [
                RelativePath = "api/auth/login",
                Headers = [#"Content-Type" = "application/json"],
                Content = Json.FromValue([
                    username = Credential[Username],
                    password = Credential[Password]
                ]),
                ManualCredentials = true
            ]
        )
    ),
    AccessToken = LoginPayload[accessToken],
    DatasetPayload = Json.Document(
        Web.Contents(
            CheckedBaseUrl,
            [
                RelativePath = DatasetPath,
                Query = [
                    #"from" = Date.ToText(FromDate, [Format = "yyyy-MM-dd", Culture = "en-US"]),
                    #"to" = Date.ToText(ToDate, [Format = "yyyy-MM-dd", Culture = "en-US"])
                ],
                Headers = [Authorization = "Bearer " & AccessToken],
                ManualCredentials = true
            ]
        )
    ),
    Rows = DatasetPayload[rows],
    Result = Table.FromRecords(Rows, null, MissingField.UseNull)
in
    Result;

SAFEERP = [
    TestConnection = (dataSourcePath) => {
        "SAFEERP.Contents",
        dataSourcePath,
        "journal-lines",
        #date(2000, 1, 1),
        #date(2000, 1, 1)
    },
    Authentication = [
        UsernamePassword = [
            UsernameLabel = "Identifiant SAFE",
            PasswordLabel = "Mot de passe SAFE"
        ]
    ],
    Label = "SAFE ERP (API protégée)"
];

SAFEERP.Publish = [
    Beta = true,
    Category = "Other",
    ButtonText = {"SAFE ERP", "Connexion aux datasets métier SAFE en lecture seule"},
    SupportsDirectQuery = false
];
