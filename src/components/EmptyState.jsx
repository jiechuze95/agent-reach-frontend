import React from 'react'
import { Inbox } from 'lucide-react'

export default function EmptyState({ icon: Icon = Inbox, message = '暂无数据', description = '' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-dark-500">
      <Icon size={40} className="mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
      {description && <p className="text-xs text-dark-600 mt-1">{description}</p>}
    </div>
  )
}
