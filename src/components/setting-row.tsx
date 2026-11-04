import { Button } from "@/components/ui/button";

// Una fila de datos con su acción al lado: la ficha de Cuentas y Mi cuenta

export function SettingRow({ label, value, help, action }: { label: string; value: string; help?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm break-words">{value}</div>
        {help && <div className="text-xs text-muted-foreground">{help}</div>}
      </div>
      {action}
    </div>
  );
}

export function RowAction({ children, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button type="button" variant="link" size="sm" className="h-11 shrink-0 px-1 underline lg:h-7" {...props}>
      {children}
    </Button>
  );
}
