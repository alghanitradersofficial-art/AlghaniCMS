$base = 'http://localhost:3001'
try {
  Write-Host 'Logging in as admin...'
  $loginBody = @{ email = 'admin@alghani.com'; password = 'admin123' } | ConvertTo-Json
  $loginResp = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType 'application/json' -Body $loginBody -ErrorAction Stop
  $token = $loginResp.token
  Write-Host 'Obtained token for admin.'
  Write-Host 'Creating product...'
  $ts = Get-Date -Format 'yyyyMMddHHmmss'
  $sku = "SMK-$ts"
  $prodBody = @{ name = "SMOKE PROD $ts"; sku = $sku; costPrice = 100; salePrice = 150; currentStock = 10; minStock = 1; unit = 'pcs' } | ConvertTo-Json
  $prod = Invoke-RestMethod -Method Post -Uri "$base/api/products" -ContentType 'application/json' -Body $prodBody -Headers @{ Authorization = "Bearer $token" } -ErrorAction Stop
  Write-Host 'Product created:' ($prod.id)

  Write-Host 'Creating customer...'
  $custEmail = "smoke+$ts@example.com"
  $custPhone = "+100000$ts"
  $custBody = @{ name = "Smoke Customer $ts"; phone = $custPhone; email = $custEmail } | ConvertTo-Json
  $cust = Invoke-RestMethod -Method Post -Uri "$base/api/customers" -ContentType 'application/json' -Body $custBody -Headers @{ Authorization = "Bearer $token" } -ErrorAction Stop
  Write-Host 'Customer created:' ($cust.id)

  Write-Host 'Creating sale (should succeed)...'
  $saleBody = @{ customerId = $cust.id; customerName = $cust.name; status = 'completed'; items = @(@{ productId = $prod.id; quantity = 1; unitPrice = 150 }) } | ConvertTo-Json -Depth 5
  $sale = Invoke-RestMethod -Method Post -Uri "$base/api/sales" -ContentType 'application/json' -Body $saleBody -Headers @{ Authorization = "Bearer $token" } -ErrorAction Stop
  Write-Host 'Sale created:' $sale.id

  $saleDate = Get-Date
  $year = $saleDate.Year
  $month = $saleDate.Month
  Write-Host "Closing month $year-$month"
  $closeBody = @{ year = $year; month = $month } | ConvertTo-Json
  $close = Invoke-RestMethod -Method Post -Uri "$base/api/months/close" -ContentType 'application/json' -Body $closeBody -Headers @{ Authorization = "Bearer $token" } -ErrorAction Stop
  Write-Host 'Month closed:' ($close | ConvertTo-Json)

  Write-Host 'Attempting to create sale in closed month (should fail with 409)...'
  $sale2Body = @{ customerId = $cust.id; customerName = $cust.name; status = 'completed'; saleDate = $saleDate.ToString('o'); items = @(@{ productId = $prod.id; quantity = 1; unitPrice = 150 }) } | ConvertTo-Json -Depth 5
  try {
    $sale2 = Invoke-RestMethod -Method Post -Uri "$base/api/sales" -ContentType 'application/json' -Body $sale2Body -Headers @{ Authorization = "Bearer $token" } -ErrorAction Stop
    Write-Host 'Unexpected success creating sale in closed month:' ($sale2 | ConvertTo-Json)
    exit 2
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.Value__ -eq 409) {
      Write-Host 'Closed-period guard working: write rejected as expected.'
      exit 0
    } else {
      Write-Host 'Unexpected error while creating sale after close:' $_
      exit 1
    }
  }
} catch {
  Write-Host 'Smoke test failed:' $_
  exit 1
}
