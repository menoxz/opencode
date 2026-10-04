# Native WinForms target for the computer-use live input test.
# WinForms controls are real Win32 controls, so UI Automation sees them with
# automation ids taken from each control's Name. TopMost so clicks land on it.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = 'ComputerUseTestTarget'
$form.Name = 'TargetForm'
$form.Width = 460
$form.Height = 280
$form.StartPosition = 'CenterScreen'

$tb = New-Object System.Windows.Forms.TextBox
$tb.Name = 'InputBox'
$tb.Location = New-Object System.Drawing.Point(20, 24)
$tb.Width = 400
$form.Controls.Add($tb)

$lbl = New-Object System.Windows.Forms.Label
$lbl.Name = 'ResultLabel'
$lbl.Text = 'idle'
$lbl.Location = New-Object System.Drawing.Point(20, 60)
$lbl.AutoSize = $true
$form.Controls.Add($lbl)

$btn = New-Object System.Windows.Forms.Button
$btn.Name = 'SubmitButton'
$btn.Text = 'Submit'
$btn.Location = New-Object System.Drawing.Point(20, 96)
$btn.Add_Click({ $lbl.Text = 'submitted:' + $tb.Text })
$form.Controls.Add($btn)

$lb = New-Object System.Windows.Forms.ListBox
$lb.Name = 'ListBox'
$lb.Location = New-Object System.Drawing.Point(260, 96)
$lb.Width = 160
$lb.Height = 120
1..40 | ForEach-Object { [void]$lb.Items.Add("Item $_") }
$form.Controls.Add($lb)

$form.TopMost = $true
[void]$form.ShowDialog()
