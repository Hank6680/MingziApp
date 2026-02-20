$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$baseUrl = "http://localhost:4000"

function Write-Section($title) {
  Write-Host "`n== $title =="
}

function Invoke-Json {
  param (
    [string]$Uri,
    [string]$Method = "GET",
    $Headers,
    $Body
  )
  if ($Body -and -not ($Body -is [string])) {
    $Body = $Body | ConvertTo-Json -Depth 8
  }
  if ($Body) {
    return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $Headers -Body $Body -ContentType "application/json"
  }
  return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $Headers
}

Write-Section "Health Check"
$health = Invoke-Json "$baseUrl/health"
$health | ConvertTo-Json -Depth 4 | Write-Host

Write-Section "Login demo user"
$demoLogin = Invoke-Json "$baseUrl/api/auth/login" -Method POST -Body @{ username = "demo"; password = "demo123" }
$demoLogin | ConvertTo-Json -Depth 4 | Write-Host
$demoHeaders = @{ Authorization = "Bearer $($demoLogin.token)" }

Write-Section "Fetch products"
$productsResponse = Invoke-Json "$baseUrl/api/products?limit=10"
$productsResponse | ConvertTo-Json -Depth 4 | Write-Host

$items = @()
if ($productsResponse.items) { $items += $productsResponse.items }
if (-not $items -or $items.Count -lt 2) {
  $more = Invoke-Json "$baseUrl/api/products?limit=50"
  if ($more.items) { $items += $more.items }
}

$kgProduct = $items | Where-Object { $_.unit -eq "kg" } | Select-Object -First 1
$boxProduct = $items | Where-Object { $_.unit -in @("箱", "桶", "包") } | Select-Object -First 1

if (-not $kgProduct -or -not $boxProduct) {
  Write-Host "未在前 10 条找到需要的商品，扩充搜索..."
  $more = Invoke-Json "$baseUrl/api/products?limit=100"
  if ($more.items) { $items = $more.items }
  if (-not $kgProduct) { $kgProduct = $items | Where-Object { $_.unit -eq "kg" } | Select-Object -First 1 }
  if (-not $boxProduct) { $boxProduct = $items | Where-Object { $_.unit -in @("箱", "桶", "包") } | Select-Object -First 1 }
}

if (-not $kgProduct) {
  Write-Host "仍未找到 kg 商品，使用列表首项"
  $kgProduct = $items | Select-Object -First 1
}
if (-not $boxProduct) {
  Write-Host "仍未找到箱/桶/包商品，使用第二项"
  $boxProduct = ($items | Select-Object -Skip 1 -First 1)
}

if (-not $kgProduct -or -not $boxProduct) {
  throw "Unable to find suitable products for test order"
}

Write-Section "Create order as demo"
$kgQty = if ($kgProduct.unit -eq 'kg') { 0.5 } else { 1 }
$boxQty = if ($boxProduct.unit -eq 'kg') { 0.5 } else { 1 }

$orderPayload = @{
  deliveryDate = (Get-Date).ToString("s")
  items = @(
    @{ productId = $kgProduct.id; qtyOrdered = $kgQty }
    @{ productId = $boxProduct.id; qtyOrdered = $boxQty }
  )
}
$newOrder = Invoke-Json "$baseUrl/api/orders" -Method POST -Headers $demoHeaders -Body $orderPayload
$newOrder | ConvertTo-Json -Depth 6 | Write-Host
$orderId = $newOrder.orderId

Write-Section "Fetch demo orders"
$demoOrders = Invoke-Json "$baseUrl/api/orders" -Headers $demoHeaders
$demoOrders | ConvertTo-Json -Depth 6 | Write-Host

Write-Section "Login admin user"
$adminLogin = Invoke-Json "$baseUrl/api/auth/login" -Method POST -Body @{ username = "admin"; password = "admin123" }
$adminHeaders = @{ Authorization = "Bearer $($adminLogin.token)" }
$adminLogin | ConvertTo-Json -Depth 4 | Write-Host

Write-Section "Admin updates order status"
$patched = Invoke-Json "$baseUrl/api/orders/$orderId/status" -Method PATCH -Headers $adminHeaders -Body @{ status = "confirmed" }
$patched | ConvertTo-Json -Depth 6 | Write-Host

Write-Section "Admin fetch order by id"
$orderById = Invoke-Json "$baseUrl/api/orders/$orderId" -Headers $adminHeaders
$orderById | ConvertTo-Json -Depth 6 | Write-Host

Write-Section "Assign trip"
$tripName = "第1车"
$tripResult = Invoke-Json "$baseUrl/api/orders/$orderId/trip" -Method PATCH -Headers $adminHeaders -Body @{ tripNumber = $tripName }
$tripResult | ConvertTo-Json -Depth 4 | Write-Host

Write-Section "Load picking list"
$picking = Invoke-Json "$baseUrl/api/orders/picking?trip=$([uri]::EscapeDataString($tripName))" -Headers $adminHeaders
Write-Host "Picking type: $($picking.GetType().FullName)"
$picking | ConvertTo-Json -Depth 4 | Write-Host

$pickingList = @($picking)
Write-Host "Picking count: $($pickingList.Count)"
if ($pickingList.Count -eq 0) {
  throw "No picking items returned"
}

$itemId = $pickingList[0].itemId

Write-Section "Mark picked"
$markPicked = Invoke-Json "$baseUrl/api/orders/items/$itemId/status" -Method PATCH -Headers $adminHeaders -Body @{ picked = $true }
$markPicked | ConvertTo-Json -Depth 4 | Write-Host

Write-Section "Mark out-of-stock"
$markOut = Invoke-Json "$baseUrl/api/orders/items/$itemId/status" -Method PATCH -Headers $adminHeaders -Body @{ outOfStock = $true }
$markOut | ConvertTo-Json -Depth 4 | Write-Host
